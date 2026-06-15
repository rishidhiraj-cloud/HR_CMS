import { safeStorage } from 'electron'
import fs from 'fs'

interface Credentials {
  email: string
  accessToken: string
  refreshToken: string
}

export class AuthStore {
  constructor(private readonly filePath: string) {}

  saveCredentials(creds: Credentials): void {
    if (!safeStorage.isEncryptionAvailable()) return
    const json = JSON.stringify(creds)
    const encrypted = safeStorage.encryptString(json)
    fs.writeFileSync(this.filePath, encrypted)
  }

  getCredentials(): Credentials | null {
    if (!safeStorage.isEncryptionAvailable()) return null
    if (!fs.existsSync(this.filePath)) return null
    try {
      const encrypted = fs.readFileSync(this.filePath)
      const json = safeStorage.decryptString(encrypted)
      return JSON.parse(json) as Credentials
    } catch {
      return null
    }
  }

  clearCredentials(): void {
    if (fs.existsSync(this.filePath)) fs.unlinkSync(this.filePath)
  }
}
