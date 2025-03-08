const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();

// Controllers
const indexController = require('./controllers/indexController')
const loginController = require('./controllers/loginController')
const registerController = require('./controllers/registerController')
const authController = require('./controllers/authController')
const logoutController = require('./controllers/logoutController')
const boardcontroller = require('./controllers/boardcontroller')
const inboardController = require('./controllers/inboardController')

// Middleware
const ifLoggedIn = require('./middleware/ifLoggedIn')
const ifNotLoggedIn = require('./middleware/ifNotLoggedIn')

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views')); // Set the views directory

app.use(session({
    secret: 'nodesecret',
    resave: false,
    saveUninitialized: true
}));




// Routes
app.get('/',indexController);
app.get('/login', ifLoggedIn, loginController);
app.get('/register', ifLoggedIn, registerController);
app.get('/board/',ifNotLoggedIn, boardcontroller.getBoardPage);
app.get('/inboards/:id', ifNotLoggedIn, inboardController.inboard);


app.post('/register',ifLoggedIn, authController.register);
app.post('/login', ifLoggedIn, authController.login);

app.post('/postboard', boardcontroller.postBoardPage);
app.delete('/deleteBoard/:id', boardcontroller.deleteBoard);
app.put('/updateBoard/:id', boardcontroller.updateBoard);

app.put('/updateInBoard/:id', boardcontroller.updateInBoard);

// เพิ่ม column ข้างใน board
app.post('/addColumn/:columnId', inboardController.addColumn);
app.put('/editColumn/:columnId', inboardController.editColumn);
app.delete('/deleteColumn/:columnId', inboardController.deleteColumn);

// เพิ่ม task
app.post('/addTask/:columnId', inboardController.addTask);
app.put('/editTask/:taskId', inboardController.editTask);
app.delete('/deleteTask/:taskId', inboardController.deleteTask);

// เพิ่มสมาชิกลงบอร์ด
app.post('/update_members', inboardController.update_members);


app.get('/logout', logoutController);


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server started on http://localhost:${PORT}`);
});
