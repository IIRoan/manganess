# MangaNess 🌊

**A feature-rich, modern manga reading application built with React Native and Expo**

MangaNess is a sophisticated mobile application that provides manga and manhwa enthusiasts with a professional-grade reading experience. Featuring advanced progress tracking, AniList synchronization, customizable themes, and a clean ad-free interface, MangaNess rivals commercial manga apps with its comprehensive feature set and smooth performance.

## Screenshots

<img src="https://github.com/user-attachments/assets/b8626bed-3e80-4509-a8c5-ab6a5412bf17" alt="Image1" height="500">
<img src="https://github.com/user-attachments/assets/e8cf415b-98a7-487b-9650-48a1d957f533" alt="Image2" height="500">
<img src="https://github.com/user-attachments/assets/bd1b99b4-b93a-4325-8434-9d4e8d1d4570" alt="Image3" height="500">
<img src="https://github.com/user-attachments/assets/16be9920-ae78-49eb-812c-4b6124f2682b" alt="Image4" height="500">
<img src="https://github.com/user-attachments/assets/f072d3bf-b7f9-4fc3-964b-990c3c5f8b1a" alt="Image5" height="500">
<img src="https://github.com/user-attachments/assets/239d924c-b3ed-43ee-ad69-e93097a1c01e" alt="Image6" height="500">

## ✨ Key Features

### 📚 **Advanced Reading Experience**
- **Optimized Chapter Reader**: Custom WebView implementation with ad-blocking
- **Interactive Reading Guide**: First-time user tutorial system
- **Smart Controls**: Auto-hiding navigation with tap-to-toggle
- **Gesture Navigation**: Intuitive tap zones and swipe controls
- **Immersive Mode**: Dynamic status bar management for distraction-free reading

### 🏠 **Smart Home Dashboard**
- **Featured Manga Banner**: Showcase of trending titles
- **Continue Reading**: Quick access to recently read manga with progress indicators
- **Trending Rankings**: Real-time popular manga with visual rankings
- **New Releases**: Latest manga updates in responsive grid layout
- **Pull-to-Refresh**: Live content updates

### 🔍 **Powerful Search & Discovery**
- **Real-time Search**: Debounced search with instant results
- **Visual Results**: Grid layout with progress indicators
- **Reading Status**: Shows last read chapter for discovered manga
- **Responsive Design**: Adapts to device orientation

### 📖 **Comprehensive Bookmark System**
- **Status Categories**: To Read, Reading, On Hold, Completed with color-coded organization
- **Dual View Modes**: Grid and list views with persistent preferences
- **Advanced Sorting**: By title (A-Z/Z-A) and reading progress (recent/oldest)
- **Search Within Bookmarks**: Filter your saved manga collection
- **Swipe Navigation**: Gesture-based navigation between status categories

### 🎨 **Customization & Themes**
- **Dynamic Theme System**: Light, Dark, and System preference support
- **Custom Accent Colors**: Full color picker with 40+ predefined colors
- **Persistent Settings**: All preferences saved across app restarts
- **Runtime Theme Switching**: Instant theme changes without restart

### 📊 **AniList Integration**
- **OAuth Authentication**: Secure login with profile display
- **Automatic Sync**: Bulk synchronization of reading progress
- **Status Mapping**: Seamless local to AniList status conversion
- **Real-time Updates**: Chapter progress syncing with retry logic

### 💾 **Data Management**
- **Export/Import**: Complete app data portability in JSON format
- **Automatic Migration**: Seamless data structure updates
- **Storage Management**: Bulk image refresh and cache clearing
- **Data Backup**: Platform sharing integration for backups

### ⚡ **Performance Optimizations**
- **Image Caching**: Smart background image caching system
- **Virtual Lists**: FlashList implementation for smooth scrolling
- **Memory Management**: Optimized component lifecycle and cleanup
- **Background Processing**: Async operations for responsive UI

## 🛠 Technologies Used

### **Core Framework**
- **React Native** (0.79.2) - Cross-platform mobile development
- **Expo Router** (5.0.6) - File-based navigation system
- **TypeScript** (5.3.3) - Type-safe development
- **Expo** (53.0.9) - Development platform and build tools

### **UI & Animation**
- **React Native Reanimated** (3.17.4) - High-performance animations
- **React Native Gesture Handler** (2.24.0) - Native gesture recognition
- **Bottom Sheet** (@gorhom/bottom-sheet 5.1.1) - Modal interfaces
- **FlashList** (@shopify/flash-list 1.7.6) - Optimized list performance
- **Linear Gradient** (expo-linear-gradient 14.0.1) - Visual effects

### **Data & Storage**
- **AsyncStorage** (@react-native-async-storage/async-storage 2.1.2) - Local persistence
- **Axios** (1.7.8) - HTTP client for API communication
- **Lodash** (4.17.21) - Utility functions

### **Platform Integration**
- **WebView** (react-native-webview 13.13.5) - Embedded web content
- **File System** (expo-file-system 18.1.9) - File operations
- **Web Browser** (expo-web-browser 14.1.6) - OAuth flows
- **Document Picker** (expo-document-picker 13.1.5) - File selection

### **Development Tools**
- **ESLint** & **Prettier** - Code formatting and linting
- **Jest** - Testing framework
- **Bun** - Fast package manager and runtime
- **EAS Build** - Cloud-based build system

## 🚀 Getting Started

### **Prerequisites**
- **Node.js** (18.0 or higher)
- **Bun** (recommended) or npm/yarn
- **Expo CLI** (`npm install -g @expo/cli`)
- **Android Studio** (for Android development)
- **Xcode** (for iOS development, macOS only)

### **Installation**

1. **Clone the repository**
   ```bash
   git clone https://github.com/IIRoan/manganess.git
   cd manganess
   ```

2. **Install dependencies**
   ```bash
   bun install
   ```

3. **Start the development server**
   ```bash
   bun start
   # or
   bunx expo start
   ```

4. **Run on device/simulator**
   - Install **Expo Go** app on your mobile device
   - Scan the QR code from the terminal
   - Or press `a` for Android emulator, `i` for iOS simulator

### **Development Scripts**

```bash
# Start with localhost tunnel
bun run startlocal

# Run on specific platforms
bun run android      # Android emulator
bun run ios          # iOS simulator  
bun run web          # Web browser

# Code quality
bun run lint         # ESLint checking
bun run format       # Prettier formatting
bun run format:check # Check formatting

# Testing
bun run test         # Run Jest tests
```

### **Building for Production**

```bash
# Install EAS CLI (if not already installed)
npm install -g eas-cli

# Build for Android
eas build --platform android

# Build for iOS  
eas build --platform ios

# Build for both platforms
eas build --platform all
```

### **Environment Setup**

1. Create a `.env` file in the root directory (optional)
2. Configure any necessary environment variables
3. Refer to `services/env.example.ts` for available configuration options

## 📱 App Information

- **Version**: 1.2
- **Supported Platforms**: iOS, Android
- **Minimum Requirements**: 
  - iOS 13.0+
  - Android API 21+ (Android 5.0)
- **Orientation**: Portrait (optimized)
- **iPad Support**: Yes

## 🤝 Contributing

We welcome contributions! Please feel free to submit issues, feature requests, or pull requests.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This app is for educational purposes only. Please support the original content creators and consider using official sources to read manga. We do not own any of the content displayed in this app.
