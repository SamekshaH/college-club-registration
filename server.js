require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// Database Connection
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
});

db.connect(err => {
    if (err) {
        console.error('Database connection failed:', err.stack);
        return;
    }
    console.log('Connected to MySQL database.');
});

// CRUD Operations for Students
app.post("/students", async (req, res) => {
    const { fname, studid, grlev, maill, phno, club_id, consent } = req.body;

    if (!club_id || isNaN(club_id)) {
        return res.status(400).json({ message: "Invalid club selection." });
    }

    try {
        // Insert student into students table
        const [studentResult] = await db.promise().query(
            "INSERT INTO students (fname, studid, grlev, maill, phno) VALUES (?, ?, ?, ?, ?)",
            [fname, studid, grlev, maill, phno]
        );

        const studentId = studentResult.insertId; // Get new student ID

        // Insert registration into registrations table
        await db.promise().query(
            "INSERT INTO registrations (student_id, club_id, consent) VALUES (?, ?, ?)",
            [studentId, club_id, consent ? 1 : 0]
        );

        res.status(201).json({ message: "Student registered successfully!" });
    } catch (error) {
        console.error("Error registering student:", error);
        res.status(500).json({ message: "Failed to register student." });
    }
});
app.get('/students', (req, res) => {
    db.query('SELECT * FROM students', (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});
app.get('/students/:id', async (req, res) => {
    const studid = req.params.id;
    
    try {
        const [students] = await db.promise().query(
            `SELECT s.id, s.fname, s.studid, s.grlev, s.maill, s.phno, r.id AS registration_id, r.club_id 
             FROM students s 
             LEFT JOIN registrations r ON s.id = r.student_id 
             WHERE s.studid = ?`, 
            [studid]
        );

        if (students.length === 0) {
            return res.status(404).json({ message: "Student not found." });
            
        }

        res.json(students[0]);
    } catch (error) {
        console.error("Error fetching student:", error);
        res.status(500).json({ message: "Failed to retrieve student details." });
        
    }
});
app.put('/students/:id', (req, res) => {
    const { fname, grlev, maill, phno } = req.body;
    const sql = 'UPDATE students SET fname=?, grlev=?, maill=?, phno=? WHERE id=?';
    db.query(sql, [fname, grlev, maill, phno, req.params.id], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: 'Student updated' });
    });
});

app.delete('/registrations/:id', async (req, res) => {
    const registrationId = req.params.id;

    try {
        // Retrieve the student_id from the registration record
        const [rows] = await db.promise().query(
            "SELECT student_id FROM registrations WHERE id = ?",
            [registrationId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: "Registration not found." });
        }

        const studentId = rows[0].student_id;

        // Delete the student record (which will cascade delete the registration)
        const [deleteResult] = await db.promise().query(
            "DELETE FROM students WHERE id = ?",
            [studentId]
        );

        if (deleteResult.affectedRows === 0) {
            return res.status(404).json({ message: "Student not found." });
        }

        res.json({ message: "Student and associated registration deleted successfully" });
    } catch (error) {
        console.error("Error deleting student and registration:", error);
        res.status(500).json({ message: "Failed to delete student and registration." });
    }
});



// CRUD Operations for Clubs
app.post('/clubs', (req, res) => {
    const { club_name } = req.body;
    db.query('INSERT INTO clubs (club_name) VALUES (?)', [club_name], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: 'Club added', id: result.insertId });
    });
});
app.get("/clubs", async (req, res) => {
    try {
        const [clubs] = await db.promise().query("SELECT id, club_name FROM clubs");
        res.json(clubs);
    } catch (error) {
        console.error("Error fetching clubs:", error);
        res.status(500).json({ message: "Failed to retrieve clubs." });
    }
});
// CRUD Operations for Registrations
app.post('/registrations', (req, res) => {
    const { student_id, club_id, consent } = req.body;
    const sql = 'INSERT INTO registrations (student_id, club_id, consent) VALUES (?, ?, ?)';
    db.query(sql, [student_id, club_id, consent], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: 'Registration successful', id: result.insertId });
    });
});

// Fix: Use LEFT JOIN to handle missing clubs properly
app.get('/registrations', (req, res) => {
    const sql = `SELECT r.id, s.fname, s.studid, s.grlev, s.maill, s.phno, 
                        COALESCE(c.club_name, 'Not Assigned') AS club_name 
                 FROM registrations r 
                 JOIN students s ON r.student_id = s.id 
                 LEFT JOIN clubs c ON r.club_id = c.id`; // LEFT JOIN to include all students
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});
app.put('/registrations/:id', (req, res) => {
    const { fname, grlev, maill, phno, club_id } = req.body;
    const registrationId = req.params.id;

    // Update the student details
    const updateStudentSql = `UPDATE students SET fname=?, grlev=?, maill=?, phno=? WHERE id=(
        SELECT student_id FROM registrations WHERE id=?
    )`;
    db.query(updateStudentSql, [fname, grlev, maill, phno, registrationId], (err, result) => {
        if (err) return res.status(500).json(err);

        // Update the club registration
        const updateClubSql = `UPDATE registrations SET club_id=? WHERE id=?`;
        db.query(updateClubSql, [club_id, registrationId], (err, result) => {
            if (err) return res.status(500).json(err);
            res.json({ message: "Registration updated successfully" });
        });
    });
});

app.delete('/registrations/:id', (req, res) => {
    console.log("Attempting to delete registration with id:", req.params.id);
    db.query('DELETE FROM registrations WHERE id=?', [req.params.id], (err, result) => {
        if (err) {
            console.error("Error deleting registration:", err);
            return res.status(500).json(err);
        }
        console.log("Deletion result:", result);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Registration not found." });
        }
        res.json({ message: 'Registration deleted' });
    });
});
const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));