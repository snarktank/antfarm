# Tamagotchi

A Tamagotchi-style virtual pet game prototype built with Godot 4 (GDScript).

## Requirements

- Godot 4.7+

## Running the Game

```bash
godot4 --path tamagotchi
```

Or open `tamagotchi/project.godot` in the Godot editor.

## Running Tests

```bash
godot4 --headless --path tamagotchi --script res://tests/run_tests.gd
```

The test runner discovers all `test_*.gd` files under `tamagotchi/tests/`, runs every method prefixed with `test_`, and exits with code `0` if all pass or `1` if any fail.

## Project Structure

```
tamagotchi/
├── project.godot          # Godot 4 project config (720×1280 portrait)
├── export_presets.cfg     # Android export preset scaffold
├── scenes/
│   └── main.tscn          # Entry scene (Node2D stub)
├── scripts/               # GDScript source files
├── tests/
│   ├── run_tests.gd       # Headless test runner
│   └── test_smoke.gd      # Smoke tests
└── assets/                # Art and audio assets
```

## Android Export

`export_presets.cfg` contains an Android export preset scaffold. To build an actual APK you will need:

- Android SDK installed and configured in Godot editor settings
- A signing keystore (debug or release)
- Godot Android export templates

The scaffolding covers orientation (portrait), package name, and version — fill in the keystore paths for a real build.
