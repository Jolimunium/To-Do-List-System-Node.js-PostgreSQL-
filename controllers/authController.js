const bcrypt = require('bcryptjs');
const db = require('../db');

exports.register = async (req, res) => {
    try {
        const { email, password, password2, Username } = req.body;
        const checkEmail = 'SELECT * FROM users WHERE email = $1';
        // ดู password ตรงไหม
        if (password !== password2) {
            return res.render('register', {
                password_message: 'Passwords do not match',
                Username: Username,
                email: email,
                password: password,
            });
        }
        const result = await db.query(checkEmail, [email]);
        if (result.rows.length > 0) {
            return res.render('register', {
                Email_already_message: 'Email already exists',
                Username: Username,
                email: email,
                password: password,
            });
        } else {
            const hashpassword = await bcrypt.hash(password, 10);
            const insertUser = 'INSERT INTO users(username, email, password_hash) VALUES ($1, $2, $3) RETURNING *';
            await db.query(insertUser, [Username, email, hashpassword]);
            res.render('register', { register_message: 'Register successfully' });
        }
    } catch (err) {
        console.error('Error during registration:', err);
        res.status(500).send('Server error');
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const sql = 'SELECT * FROM users WHERE email = $1';
        const result = await db.query(sql, [email]);
        if (result.rows.length > 0) {
            const user = result.rows[0];
            if (await bcrypt.compare(password, user.password_hash)) {
                req.session.user = { id: user.id, email: user.email, username: user.username };
                return res.redirect('/');
            } else {
                return res.render('login', {
                    Login_message: 'Password is incorrect',
                    email: email,
                });
            }
        } else {
            return res.render('login', {
                Login_message: 'Email is incorrect',
                email: email,
            });
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
};