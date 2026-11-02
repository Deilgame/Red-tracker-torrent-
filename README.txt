Red tracker — торрент-клиент (Electron + WebTorrent)

Сборка установщика (Windows):
1. Установите Node.js LTS (https://nodejs.org)
2. Запустите build-setup.bat (двойной клик)
3. Установщик появится в dist\Red-tracker-setup.exe

Тест без сборки: npm install, затем npm start

Установщик: мастер установки (NSIS) на русском — выбор папки, ярлыки на рабочем столе
и в меню «Пуск», запуск после установки, деинсталлятор в «Приложения и возможности».
Без установки Node.js: загрузите проект на GitHub, вкладка Actions -> Build Red tracker
setup.exe -> Run workflow; готовый setup.exe будет в Artifacts.
