const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const app = express();
const port = 3070;

// Middleware
app.use(cors());
app.use(express.json());

// PostgreSQL connection
const pool = new Pool({
    user: 'postgres',
    host: 'postgres',
    database: 'payroll_db',
    password: 'admin123',
    port: 5432,
});

// Allowed departments and employment types
const ALLOWED_DEPARTMENTS = ['IT', 'HR', 'Finance', 'Marketing', 'Sales', 'Operations', 'Engineering'];
const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Temporary', 'Intern'];

// Create payslips table with enhanced structure
async function initializeDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS payslips (
                id SERIAL PRIMARY KEY,
                employee_name VARCHAR(50) NOT NULL,
                employee_id VARCHAR(7) NOT NULL,
                department VARCHAR(30) NOT NULL,
                employment_type VARCHAR(20) NOT NULL,
                working_days INTEGER NOT NULL CHECK (working_days BETWEEN 1 AND 31),
                date_of_joining DATE NOT NULL,
                bank_details JSONB NOT NULL,
                government_ids JSONB NOT NULL,
                earnings JSONB NOT NULL,
                deductions JSONB NOT NULL,
                totals JSONB NOT NULL,
                timestamp TIMESTAMPTZ NOT NULL,
                CONSTRAINT unique_employee_month UNIQUE (employee_id, timestamp)
            );
        `);
        console.log('Database initialized');
    } catch (err) {
        console.error('Error initializing database:', err);
    }
}

initializeDatabase();

// API Endpoints

// Get all payslips (with optional department filter)
app.get('/api/payslips', async (req, res) => {
    const { department, employment_type } = req.query;
    try {
        let query = 'SELECT * FROM payslips ORDER BY timestamp DESC';
        let params = [];
        let conditions = [];
        
        if (department && ALLOWED_DEPARTMENTS.includes(department)) {
            conditions.push('department = $' + (params.length + 1));
            params.push(department);
        }
        
        if (employment_type && EMPLOYMENT_TYPES.includes(employment_type)) {
            conditions.push('employment_type = $' + (params.length + 1));
            params.push(employment_type);
        }
        
        if (conditions.length > 0) {
            query = 'SELECT * FROM payslips WHERE ' + conditions.join(' AND ') + ' ORDER BY timestamp DESC';
        }
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get payslip by employee ID and month
app.get('/api/payslips/:employeeId/:month', async (req, res) => {
    const { employeeId, month } = req.params;
    try {
        const startDate = new Date(month + '-01');
        const endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + 1);
        
        const result = await pool.query(
            'SELECT * FROM payslips WHERE employee_id = $1 AND timestamp >= $2 AND timestamp < $3',
            [employeeId, startDate, endDate]
        );
        
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(404).json({ error: 'Payslip not found' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create a new payslip
app.post('/api/payslips', async (req, res) => {
    const { 
        employeeName, 
        employeeId, 
        department, 
        employmentType,
        workingDays,
        dateOfJoining,
        bankDetails,
        governmentIds,
        earnings, 
        deductions, 
        totals, 
        timestamp 
    } = req.body;
    
    // Validate department
    if (!ALLOWED_DEPARTMENTS.includes(department)) {
        return res.status(400).json({ error: `Invalid department. Must be one of: ${ALLOWED_DEPARTMENTS.join(', ')}` });
    }

    // Validate employment type
    if (!EMPLOYMENT_TYPES.includes(employmentType)) {
        return res.status(400).json({ error: `Invalid employment type. Must be one of: ${EMPLOYMENT_TYPES.join(', ')}` });
    }

    // Validate working days
    if (workingDays < 1 || workingDays > 31) {
        return res.status(400).json({ error: 'Working days must be between 1 and 31' });
    }

    // Validate timestamp (not in the future)
    const selectedDate = new Date(timestamp);
    const currentDate = new Date();
    if (selectedDate > currentDate) {
        return res.status(400).json({ error: 'Payslip date cannot be in the future' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO payslips (
                employee_name, 
                employee_id, 
                department, 
                employment_type,
                working_days,
                date_of_joining,
                bank_details,
                government_ids,
                earnings, 
                deductions, 
                totals, 
                timestamp
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
            [
                employeeName, 
                employeeId, 
                department, 
                employmentType,
                workingDays,
                dateOfJoining,
                bankDetails,
                governmentIds,
                earnings, 
                deductions, 
                totals, 
                timestamp
            ]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get PF records for a specific month (with optional department filter)
app.get('/api/pf-records/:month', async (req, res) => {
    const { month } = req.params;
    const { department } = req.query;
    try {
        const startDate = new Date(month + '-01');
        const endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + 1);
        
        let query = `
            SELECT 
                employee_name, 
                employee_id, 
                government_ids->>'pfNumber' as pf_number,
                deductions->>'pf' as pf_amount 
            FROM payslips 
            WHERE timestamp >= $1 AND timestamp < $2
        `;
        let params = [startDate, endDate];
        
        if (department && ALLOWED_DEPARTMENTS.includes(department)) {
            query += ' AND department = $3';
            params.push(department);
        }
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get ESIC records for a specific month
app.get('/api/esic-records/:month', async (req, res) => {
    const { month } = req.params;
    const { department } = req.query;
    try {
        const startDate = new Date(month + '-01');
        const endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + 1);
        
        let query = `
            SELECT 
                employee_name, 
                employee_id, 
                government_ids->>'esicNumber' as esic_number,
                deductions->>'healthInsurance' as esic_amount 
            FROM payslips 
            WHERE timestamp >= $1 AND timestamp < $2
        `;
        let params = [startDate, endDate];
        
        if (department && ALLOWED_DEPARTMENTS.includes(department)) {
            query += ' AND department = $3';
            params.push(department);
        }
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get employee tax details (PAN based)
app.get('/api/tax-records/:month', async (req, res) => {
    const { month } = req.params;
    const { department } = req.query;
    try {
        const startDate = new Date(month + '-01');
        const endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + 1);
        
        let query = `
            SELECT 
                employee_name, 
                employee_id, 
                government_ids->>'panNumber' as pan_number,
                totals->>'totalEarnings' as gross_income,
                deductions->>'incomeTaxDeduction' as tax_deduction
            FROM payslips 
            WHERE timestamp >= $1 AND timestamp < $2
        `;
        let params = [startDate, endDate];
        
        if (department && ALLOWED_DEPARTMENTS.includes(department)) {
            query += ' AND department = $3';
            params.push(department);
        }
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://16.170.201.139:${port}`);
});