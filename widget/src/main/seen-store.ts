import Database from 'better-sqlite3'

export class SeenStore {
  private db: Database.Database

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    this.db.exec(`
      create table if not exists seen_messages (
        message_id text primary key
      )
    `)
  }

  hasSeen(messageId: string): boolean {
    const row = this.db
      .prepare('select 1 from seen_messages where message_id = ?')
      .get(messageId)
    return !!row
  }

  markSeen(messageId: string): void {
    this.db
      .prepare('insert or ignore into seen_messages (message_id) values (?)')
      .run(messageId)
  }

  filterUnseen(messageIds: string[]): string[] {
    return messageIds.filter(id => !this.hasSeen(id))
  }

  getAllSeen(): string[] {
    const rows = this.db.prepare('select message_id from seen_messages').all() as { message_id: string }[]
    return rows.map(r => r.message_id)
  }

  close(): void {
    this.db.close()
  }
}
