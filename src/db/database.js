const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

class Database {
    constructor(dbPath = './media.db') {
        this.dbPath = dbPath;
        this.db = null;
    }

    async initialize() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('Error opening database:', err);
                    reject(err);
                } else {
                    console.log('Connected to SQLite database');
                    this.runSchema().then(resolve).catch(reject);
                }
            });
        });
    }

    async runSchema() {
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        
        return new Promise((resolve, reject) => {
            this.db.exec(schema, (err) => {
                if (err) {
                    console.error('Error executing schema:', err);
                    reject(err);
                } else {
                    console.log('Database schema initialized');
                    resolve();
                }
            });
        });
    }

    // Movies table operations
    async createMovie(movieData) {
        const { title, year, filename, path, file_size } = movieData;
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO movies (title, year, filename, path, file_size, status)
                VALUES (?, ?, ?, ?, ?, 'uploading')
            `;
            this.db.run(sql, [title, year, filename, path, file_size], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    async updateMovie(id, updates) {
        const fields = Object.keys(updates);
        const values = Object.values(updates);
        const sql = `UPDATE movies SET ${fields.map(f => `${f} = ?`).join(', ')} WHERE id = ?`;
        
        return new Promise((resolve, reject) => {
            this.db.run(sql, [...values, id], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    async getMovie(id) {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM movies WHERE id = ?';
            this.db.get(sql, [id], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    async getAllMovies(status = null) {
        return new Promise((resolve, reject) => {
            let sql = 'SELECT * FROM movies';
            let params = [];
            
            if (status) {
                sql += ' WHERE status = ?';
                params.push(status);
            }
            
            sql += ' ORDER BY uploaded_at DESC';
            
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async deleteMovie(id) {
        return new Promise((resolve, reject) => {
            const sql = 'DELETE FROM movies WHERE id = ?';
            this.db.run(sql, [id], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    // Upload session operations
    async createUploadSession(sessionData) {
        const { id, filename, total_size, chunk_size, expires_at } = sessionData;
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO upload_sessions (id, filename, total_size, chunk_size, expires_at)
                VALUES (?, ?, ?, ?, ?)
            `;
            this.db.run(sql, [id, filename, total_size, chunk_size, expires_at], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(id);
                }
            });
        });
    }

    async getUploadSession(id) {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM upload_sessions WHERE id = ?';
            this.db.get(sql, [id], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    async updateUploadSession(id, updates) {
        const fields = Object.keys(updates);
        const values = Object.values(updates);
        const sql = `UPDATE upload_sessions SET ${fields.map(f => `${f} = ?`).join(', ')} WHERE id = ?`;
        
        return new Promise((resolve, reject) => {
            this.db.run(sql, [...values, id], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    async cleanupExpiredSessions() {
        return new Promise((resolve, reject) => {
            const sql = 'DELETE FROM upload_sessions WHERE status = "expired" OR expires_at < datetime("now")';
            this.db.run(sql, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    close() {
        return new Promise((resolve) => {
            if (this.db) {
                this.db.close((err) => {
                    if (err) {
                        console.error('Error closing database:', err);
                    } else {
                        console.log('Database connection closed');
                    }
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

module.exports = Database;