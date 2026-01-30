# Pulsar Release Guide

This guide covers the 3 critical steps to prepare your environment for releasing Pulsar.

## 1. Setup GitHub Releases
The auto-updater relies on GitHub Releases to host the files.

1.  **Create a GitHub Repo**: Push your code to a repo (e.g., `Hootsworth/Project-Pulsar`).
2.  **Generate Token**: Go to GitHub -> Settings -> Developer Settings -> Personal Access Tokens (Classic).
    - Generate a new token with `repo` scope.
    - Copy this token.
3.  **Environment Variable**: On your computer, set `GH_TOKEN` to this value.
    - Powershell: `$env:GH_TOKEN="your_token_here"`

## 2. Code Signing (Windows) - CRITICAL
Without this, Windows will show a scary "Unknown Publisher" warning (SmartScreen).

1.  **Buy a Certificate**: Purchase a "Code Signing Certificate" (OV or EV) from a provider like Sectigo, DigiCert, or SSL.com (~$100-$400/year).
2.  **Export PFX**: Once validated, export your certificate as a `.pfx` file.
3.  **Configure**: Set env vars for the build:
    - `CSC_LINK`: Path to your `.pfx` file.
    - `CSC_KEY_PASSWORD`: Password for the `.pfx`.

## 3. Google OAuth Setup
Required for Google Sign-In features.

1.  Go to [Google Cloud Console](https://console.cloud.google.com/).
2.  Create a Project ("Pulsar Browser").
3.  Go to **APIs & Services -> OAuth consent screen**.
    - User Type: External.
    - Fill in App Name ("Pulsar") and support email.
4.  Go to **Credentials -> Create Credentials -> OAuth client ID**.
    - Application Type: **Desktop app**.
    - Name: "Pulsar Desktop".
5.  Copy the **Client ID** and **Client Secret**.
6.  Add these to your `main.js` or environment variables where auth logic resides.

## 4. Building & Releasing

**To Build Locally (Testing):**
```bash
npm run dist
```
This creates an installer in the `dist` folder.

**To Release to GitHub:**
```bash
npm run release
```
This builds the installer, signs it (if env vars are set), and uploads it to a draft release on GitHub.
