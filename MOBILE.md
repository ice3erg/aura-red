# +aura — Мобильное приложение (Capacitor)

## Что это

Capacitor оборачивает наш сайт (aura-red.onrender.com) в нативную оболочку iOS/Android.
**Код менять не нужно** — приложение загружает сайт как webview.

## Требования

- **Node.js** 18+
- **Android**: Android Studio + JDK 17
- **iOS**: Mac + Xcode 14+ + Apple Developer аккаунт ($99/год)

## Быстрый старт

```bash
# 1. Установить зависимости
npm install

# 2. Добавить платформы
npx cap add android
npx cap add ios

# 3. Синхронизировать
npx cap sync

# 4. Открыть в Android Studio
npx cap open android

# 5. Открыть в Xcode (только Mac)
npx cap open ios
```

## Публикация Android (Google Play)

1. В Android Studio → Build → Generate Signed Bundle/APK
2. Создать keystore (сохрани навсегда!)
3. Загрузить `.aab` файл в Google Play Console
4. Заполнить листинг → Submit

Стоимость: **$25 единоразово**

## Публикация iOS (App Store)

1. В Xcode → Product → Archive
2. В Xcode Organizer → Distribute App
3. TestFlight для теста, потом App Store

Стоимость: **$99/год**

## Push-уведомления

Для пушей нужно:
1. Firebase Cloud Messaging (Android) — бесплатно
2. Apple Push Notification Service (iOS) — включено в $99

Capacitor плагин: `@capacitor/push-notifications` — уже в конфиге.

## Нативные фичи которые получаем

| Фича | Браузер (PWA) | Приложение (Capacitor) |
|------|--------------|----------------------|
| Push-уведомления | Ограничено (iOS нет) | ✅ Полные |
| Геолокация фоновая | ❌ | ✅ |
| Вибрация | Частично | ✅ Haptic feedback |
| App Store / Play | ❌ | ✅ |
| Иконка на экране | ✅ PWA | ✅ Нативная |

## Текущий конфиг

```
appId: com.aura.app
webDir: public
server.url: https://aura-red.onrender.com
```
