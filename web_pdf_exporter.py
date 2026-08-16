"""教學網頁整頁 PDF 匯出視窗。"""

from __future__ import annotations

import os
import queue
import re
import json
import subprocess
import sys
import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk


ROOT = Path(__file__).resolve().parent
EXPORTER = ROOT / "export_long_web_pdf.mjs"
EXPORTS_DIR = ROOT / "exports"
CATALOG = ROOT / "page-chapter-catalog.js"
TITLE_PATTERN = re.compile(r"<title[^>]*>\s*(.*?)\s*</title>", re.IGNORECASE | re.DOTALL)
CHAPTER_META_PATTERN = re.compile(
    r'<meta\s+[^>]*name=["\']chapter-code["\'][^>]*content=["\']([^"\']+)["\']',
    re.IGNORECASE,
)
CHAPTER_CODE_PATTERN = re.compile(r"^([js])(\d+)(?:-(\d+))?", re.IGNORECASE)


def page_title(path: Path) -> str:
    """取出 HTML 標題；沒有標題時就使用檔名。"""
    try:
        source = path.read_text(encoding="utf-8")
        match = TITLE_PATTERN.search(source)
        if match:
            return re.sub(r"\s+", " ", match.group(1)).strip()
    except OSError:
        pass
    return path.stem


def load_catalog() -> dict[str, dict[str, object]]:
    """讀取首頁與匯出工具共用的章節對照表。"""
    if not CATALOG.exists():
        return {}
    try:
        source = CATALOG.read_text(encoding="utf-8")
        marker = "window.MATH_PAGE_CHAPTER_CATALOG ="
        payload = source.split(marker, 1)[1].strip().split(";", 1)[0].strip()
        records = json.loads(payload)
        return {filename: record for filename, record in records.items() if isinstance(record, dict)}
    except (IndexError, OSError, json.JSONDecodeError):
        return {}


def chapter_code_for_page(path: Path, catalog: dict[str, dict[str, object]]) -> str:
    """優先使用共用對照表；新頁也可在 HTML 寫入 chapter-code meta。"""
    if path.name in catalog:
        return str(catalog[path.name].get("chapterCode", "")).strip()
    try:
        source = path.read_text(encoding="utf-8")
        match = CHAPTER_META_PATTERN.search(source)
        if match:
            return match.group(1).strip()
    except OSError:
        pass
    return ""


def chapter_sort_key(chapter_code: str, path: Path, manual_order: int = 999) -> tuple[int, int, int, int, int, str]:
    """依 j1 → j6 → s1 → s6，再依小節排序；未標註頁面固定放最後。"""
    match = CHAPTER_CODE_PATTERN.match(chapter_code)
    if not match:
        return (9, 99, 99, 1, manual_order, path.name.casefold())
    stage, term, section = match.groups()
    return (
        0 if stage.lower() == "j" else 1,
        int(term),
        int(section or 0),
        1 if "+" in chapter_code else 0,
        manual_order,
        path.name.casefold(),
    )


class WebPdfExporter(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("數學教學網頁－整頁 PDF 匯出")
        self.geometry("660x385")
        self.minsize(620, 360)
        self.option_add("*Font", ("Microsoft JhengHei", 10))

        catalog = load_catalog()
        page_records = [
            (
                path,
                chapter_code_for_page(path, catalog),
                int(catalog.get(path.name, {}).get("order", 999)),
            )
            for path in ROOT.glob("*.html")
            if path.name != "index.html" and not path.name.startswith(".")
        ]
        page_records.sort(key=lambda item: chapter_sort_key(item[1], item[0], item[2]))
        self.pages = [path for path, _chapter_code, _order in page_records]
        self.labels = {
            f"{chapter_code or '未標註章節'}｜{page_title(path)}　〔{path.name}〕": path
            for path, chapter_code, _order in page_records
        }
        self.selected_page = tk.StringVar(value=next(iter(self.labels), ""))
        self.output_path = tk.StringVar()
        self.status = tk.StringVar(value="選擇教學頁後，按下「匯出整頁 PDF」。")
        self.events: queue.Queue[tuple[str, str]] = queue.Queue()

        self.build_ui()
        self.update_output_name()
        self.after(80, self.process_events)

    def build_ui(self) -> None:
        frame = ttk.Frame(self, padding=22)
        frame.pack(fill="both", expand=True)
        frame.columnconfigure(1, weight=1)

        ttk.Label(frame, text="整頁 PDF 匯出", font=("Microsoft JhengHei", 18, "bold")).grid(
            row=0, column=0, columnspan=3, sticky="w"
        )
        ttk.Label(
            frame,
            text="輸出會保留目前教學頁的完整內容，製成一張 A4 寬度的長頁 PDF。",
            foreground="#475569",
        ).grid(row=1, column=0, columnspan=3, sticky="w", pady=(5, 22))

        ttk.Label(frame, text="教學頁：").grid(row=2, column=0, sticky="w", pady=7)
        self.page_box = ttk.Combobox(
            frame,
            textvariable=self.selected_page,
            values=list(self.labels),
            state="readonly",
        )
        self.page_box.grid(row=2, column=1, columnspan=2, sticky="ew", pady=7)
        self.page_box.bind("<<ComboboxSelected>>", lambda _event: self.update_output_name())

        ttk.Label(frame, text="輸出檔案：").grid(row=3, column=0, sticky="w", pady=7)
        ttk.Entry(frame, textvariable=self.output_path).grid(row=3, column=1, sticky="ew", pady=7)
        ttk.Button(frame, text="選擇位置…", command=self.choose_output).grid(row=3, column=2, sticky="e", padx=(10, 0), pady=7)

        ttk.Separator(frame).grid(row=4, column=0, columnspan=3, sticky="ew", pady=18)
        ttk.Label(frame, text="匯出方式：").grid(row=5, column=0, sticky="nw")
        ttk.Label(
            frame,
            justify="left",
            text="整頁長 PDF（目前原型）：以本機 Chrome 載入網頁、等待公式與圖形完成，\n再依內容實際高度輸出成單一 PDF 頁。",
        ).grid(row=5, column=1, columnspan=2, sticky="w")

        self.export_button = ttk.Button(frame, text="匯出整頁 PDF", command=self.start_export)
        self.export_button.grid(row=6, column=1, sticky="e", pady=(25, 10))
        self.open_button = ttk.Button(frame, text="開啟匯出資料夾", command=self.open_exports)
        self.open_button.grid(row=6, column=2, sticky="e", padx=(10, 0), pady=(25, 10))

        ttk.Label(frame, textvariable=self.status, foreground="#0f766e", wraplength=590).grid(
            row=7, column=0, columnspan=3, sticky="w", pady=(10, 0)
        )

    def update_output_name(self) -> None:
        path = self.labels.get(self.selected_page.get())
        if not path:
            self.output_path.set("")
            return
        self.output_path.set(str(EXPORTS_DIR / f"{path.stem}-整頁.pdf"))

    def choose_output(self) -> None:
        current = Path(self.output_path.get()) if self.output_path.get() else EXPORTS_DIR / "教學頁-整頁.pdf"
        selected = filedialog.asksaveasfilename(
            title="儲存整頁 PDF",
            initialdir=current.parent,
            initialfile=current.name,
            defaultextension=".pdf",
            filetypes=[("PDF 檔案", "*.pdf")],
        )
        if selected:
            self.output_path.set(selected)

    def start_export(self) -> None:
        page = self.labels.get(self.selected_page.get())
        output = Path(self.output_path.get()).expanduser()
        if not page:
            messagebox.showerror("沒有教學頁", "請先選擇要匯出的 HTML 教學頁。")
            return
        if output.suffix.lower() != ".pdf":
            messagebox.showerror("副檔名不正確", "輸出檔案必須使用 .pdf 副檔名。")
            return
        self.export_button.configure(state="disabled")
        self.status.set("正在載入教學頁、等待公式與圖形完成，請稍候…")
        threading.Thread(target=self.run_export, args=(page, output), daemon=True).start()

    def run_export(self, page: Path, output: Path) -> None:
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        command = ["node", str(EXPORTER), page.name, str(output.resolve())]
        try:
            result = subprocess.run(
                command,
                cwd=ROOT,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=150,
                creationflags=creationflags,
            )
            if result.returncode == 0:
                self.events.put(("success", f"匯出完成：{output.name}"))
            else:
                detail = result.stderr.strip() or result.stdout.strip() or "未知錯誤"
                self.events.put(("error", detail))
        except subprocess.TimeoutExpired:
            self.events.put(("error", "匯出超過 150 秒仍未完成，請確認網頁是否有持續載入的外部資源。"))
        except OSError as error:
            self.events.put(("error", f"無法啟動匯出工具：{error}"))

    def process_events(self) -> None:
        try:
            while True:
                kind, message = self.events.get_nowait()
                self.export_button.configure(state="normal")
                if kind == "success":
                    self.status.set(message)
                    messagebox.showinfo("整頁 PDF 匯出完成", message)
                else:
                    self.status.set("匯出失敗，請查看訊息後再試一次。")
                    messagebox.showerror("整頁 PDF 匯出失敗", message)
        except queue.Empty:
            pass
        self.after(80, self.process_events)

    def open_exports(self) -> None:
        EXPORTS_DIR.mkdir(exist_ok=True)
        os.startfile(EXPORTS_DIR)


if __name__ == "__main__":
    if not EXPORTER.exists():
        raise SystemExit(f"找不到匯出核心：{EXPORTER}")
    WebPdfExporter().mainloop()
