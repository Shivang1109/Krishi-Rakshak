# Krishi Rakshak Mobile App (Flutter)

## Quick Setup

```bash
# 1. Install Flutter (if not already installed)
brew install flutter   # macOS

# 2. Create Flutter app
cd /Users/shivangpathak/WORK/Krishi_Rakshak/mobile
flutter create krishi_rakshak_app
cd krishi_rakshak_app

# 3. Add dependencies to pubspec.yaml
# 4. Run on device/emulator
flutter run
```

## Required Dependencies (pubspec.yaml)
```yaml
dependencies:
  flutter:
    sdk: flutter
  http: ^1.2.0
  image_picker: ^1.0.7
  permission_handler: ^11.0.1
  cached_network_image: ^3.3.1
  lottie: ^3.1.0
  google_fonts: ^6.1.0
```

> The full Flutter source code is in `krishi_rakshak_app/lib/`
