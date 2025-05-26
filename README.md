# MangaNess 🌊

A manga reading app that lets you discover, read, and track your favorite manga with a clean, customizable interface.

## Screenshots

<img src="https://github.com/user-attachments/assets/b8626bed-3e80-4509-a8c5-ab6a5412bf17" alt="Image1" height="500">
<img src="https://github.com/user-attachments/assets/e8cf415b-98a7-487b-9650-48a1d957f533" alt="Image2" height="500">
<img src="https://github.com/user-attachments/assets/bd1b99b4-b93a-4325-8434-9d4e8d1d4570" alt="Image3" height="500">
<img src="https://github.com/user-attachments/assets/16be9920-ae78-49eb-812c-4b6124f2682b" alt="Image4" height="500">
<img src="https://github.com/user-attachments/assets/f072d3bf-b7f9-4fc3-964b-990c3c5f8b1a" alt="Image5" height="500">
<img src="https://github.com/user-attachments/assets/239d924c-b3ed-43ee-ad69-e93097a1c01e" alt="Image6" height="500">

## What is MangaNess?

MangaNess is a mobile app designed for manga readers who want a smooth, personalized reading experience. Whether you're catching up on ongoing series or discovering new favorites, the app helps you stay organized and never lose your place.

### Key Features

**Reading Experience**
- Clean, distraction-free manga reader with WebView rendering
- Continue reading from your home screen - pick up exactly where you left off
- Browse trending manga and new releases
- Search and discover manga across multiple sources

**Library Management** 
- Bookmark system with four categories: Reading, To Read, On Hold, and Read
- Track your reading progress automatically as you read chapters
- Sort and organize your bookmarks by title, date added, or reading status
- View your library in both grid and list layouts

**Customization**
- Light, dark, and system themes that adapt to your device
- Custom accent colors with over 40 pre-defined options
- Color picker to create your own personalized theme
- Responsive design that works great on phones and tablets

**Sync & Backup**
- AniList integration - connect your account to sync reading progress
- Export and import your entire library and reading data
- Automatic data migration when updating the app

**Smart Features**
- Recently read manga section on home screen
- Reading history that tracks all the chapters you've completed
- Image caching for faster loading and offline viewing
- Cloudflare detection and handling for reliable manga access

The app is built to be fast, reliable, and easy to use - no complicated setup, just install and start reading.

---

## For Developers

### Tech Stack

- **Framework**: React Native with Expo SDK 53
- **Language**: TypeScript
- **Navigation**: Expo Router with typed routes
- **UI Components**: React Native core components with Reanimated 3
- **Storage**: AsyncStorage for local data persistence
- **HTTP**: Axios for API requests
- **Styling**: StyleSheet with theme context
- **Platform**: iOS 13+, Android 5.0+

### Dependencies

**Core Dependencies**
```
React Native 0.79.2, React 19.0.0, Expo SDK 53
@react-navigation/native, expo-router
@react-native-async-storage/async-storage
react-native-webview, axios
react-native-reanimated, react-native-gesture-handler
```

**UI & Theming**
```
@expo/vector-icons, react-native-svg
expo-linear-gradient, react-native-color-picker
```

**Development Tools**
```
TypeScript 5.3.3, ESLint, Prettier
@types packages for type safety
```

### Getting Started

**Prerequisites**
- Node.js 18+
- Bun (recommended) or npm/yarn
- Expo CLI or Expo dev tools

**Installation**

1. Clone and install
   ```bash
   git clone https://github.com/IIRoan/manganess.git
   cd manganess
   bun install
   ```

2. Start development server
   ```bash
   bun start
   ```

3. Run on device/emulator
   - Install Expo Go app and scan QR code
   - Or use `bun run android` / `bun run ios` for emulators

**Development Commands**
```bash
bun run startlocal    # Start with localhost tunnel
bun run android       # Run on Android emulator  
bun run ios           # Run on iOS simulator
bun run web           # Run in web browser
bun run lint          # Check code style
bun run format        # Format code with Prettier
```

**Building for Production**
```bash
npm install -g eas-cli
eas build --platform android
eas build --platform ios
```

### Project Structure

```
app/                     # Expo Router pages
├── (tabs)/             # Tab navigation screens
│   ├── index.tsx       # Home screen
│   ├── bookmarks.tsx   # Library management
│   ├── settings.tsx    # App settings
│   └── manga/          # Manga details and reader
components/             # Reusable UI components
services/               # API calls and data management
constants/              # Colors, config, theme context
types/                  # TypeScript type definitions
hooks/                  # Custom React hooks
```

### Configuration

The app uses Expo's configuration system. Key settings in `app.json`:
- App versioning and metadata
- Platform-specific settings (iOS/Android)
- Splash screen and icon configuration
- Over-the-air update settings

### Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes and test thoroughly
4. Run linting: `bun run lint`
5. Format code: `bun run format`
6. Submit a pull request

### License

MIT License - see [LICENSE](LICENSE) file for details.

### Disclaimer

This app is for educational purposes. Please support official manga publishers and platforms.