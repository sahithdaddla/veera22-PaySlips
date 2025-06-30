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