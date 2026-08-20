(() => {
  "use strict";

  // GA4 測量 ID。此 ID 可公開放在網站原始碼中，並非登入憑證。
  const measurementId = "G-J90PSGWQPZ";

  // 僅統計正式 HTTPS 網站，避免本機直接開啟檔案時產生測試資料。
  if (location.protocol !== "https:") return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  window.gtag("js", new Date());
  window.gtag("config", measurementId);

  const googleTag = document.createElement("script");
  googleTag.async = true;
  googleTag.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(googleTag);
})();
