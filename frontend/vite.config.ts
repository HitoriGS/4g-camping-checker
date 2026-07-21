import { defineConfig } from "vite";

// GitHub Pages 把這個專案部署在 https://<user>.github.io/4g-camping-checker/
// 這種「專案頁面」路徑，不是網域根目錄，所以要設定 base，
// 不然打包出來的資源會用絕對路徑 /assets/... 指到網域根目錄，變成 404。
export default defineConfig({
  base: "/4g-camping-checker/",
});
