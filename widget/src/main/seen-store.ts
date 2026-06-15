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

  close(): void {
    this.db.close()
  }
}
