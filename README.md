# MangaNess

A simple manga reading app built with React Native and Expo.

## Screenshots

<img src="https://github.com/user-attachments/assets/b8626bed-3e80-4509-a8c5-ab6a5412bf17" alt="Image1" height="500">
<img src="https://github.com/user-attachments/assets/e8cf415b-98a7-487b-9650-48a1d957f533" alt="Image2" height="500">
<img src="https://github.com/user-attachments/assets/bd1b99b4-b93a-4325-8434-9d4e8d1d4570" alt="Image3" height="500">
<img src="https://github.com/user-attachments/assets/16be9920-ae78-49eb-812c-4b6124f2682b" alt="Image4" height="500">
<img src="https://github.com/user-attachments/assets/f072d3bf-b7f9-4fc3-964b-990c3c5f8b1a" alt="Image5" height="500">
<img src="https://github.com/user-attachments/assets/239d924c-b3ed-43ee-ad69-e93097a1c01e" alt="Image6" height="500">

## Features

- Browse and search manga
- Read chapters with a clean reader
- Bookmark manga and track your reading progress
- Sync with AniList
- Light and dark themes
- Export and import your data

## Tech Stack

- React Native & Expo
- TypeScript
- React Navigation
- AsyncStorage for local data
- WebView for reading

## Getting Started

### Prerequisites
- Node.js 18+
- Bun (or npm/yarn)
- Expo CLI

### Installation

1. Clone the repository
   ```bash
   git clone https://github.com/IIRoan/manganess.git
   cd manganess
   ```

2. Install dependencies
   ```bash
   bun install
   ```

3. Start the development server
   ```bash
   bun start
   ```

4. Run on your device
   - Install Expo Go on your phone
   - Scan the QR code
   - Or press `a` for Android emulator, `i` for iOS simulator

### Development

```bash
bun run startlocal    # Start with localhost
bun run android       # Android emulator
bun run ios           # iOS simulator
bun run web           # Web browser
bun run lint          # Run linting
bun run format        # Format code
```

### Building

```bash
npm install -g eas-cli
eas build --platform android  # or ios, or all
```

## App Info

- Version: 1.2
- Supports: iOS 13+, Android 5.0+
- Orientation: Portrait

## Contributing

Feel free to submit issues and pull requests.

## License

MIT License - see [LICENSE](LICENSE) file.

## Disclaimer

This app is for educational purposes. Please support official manga sources.