const db = require('../db');

exports.getBoardPage = async (req, res) => {
    try {
        const userId = req.session.user ? req.session.user.id : null;

        if (!userId) {
            return res.status(403).send('Unauthorized: Please login');
        }

        // ดึง Board ที่ user เป็นเจ้าของ หรือ user เป็นสมาชิก
        const boardsQuery = await db.query(`
            SELECT * FROM boards
            WHERE owner_id = $1 OR EXISTS (
                SELECT 1
                FROM board_members
                WHERE board_members.board_id = boards.id
                AND board_members.user_id = $1
            )
            ORDER BY updated_at DESC
        `, [userId]);

        const boards = boardsQuery.rows;

        // ดึงข้อมูลเจ้าของบอร์ด
        const boardOwnersQuery = await db.query(`
            SELECT boards.id AS board_id, users.username, users.id AS owner_id
            FROM boards
            INNER JOIN users ON boards.owner_id = users.id
            WHERE boards.id IN (
                SELECT id FROM boards WHERE owner_id = $1 
                OR id IN (SELECT board_id FROM board_members WHERE user_id = $1)
            )
        `, [userId]);

        const boardOwners = boardOwnersQuery.rows; // เก็บ owner ของแต่ละบอร์ด

        // ดึงสมาชิกของแต่ละ board โดย SELECT board_id มาด้วย
        const boardMembersQuery = await db.query(`
            SELECT board_members.board_id, users.id AS user_id, users.username
            FROM users
            INNER JOIN board_members ON users.id = board_members.user_id
            WHERE board_members.board_id IN (SELECT id FROM boards WHERE owner_id = $1 OR id IN (SELECT board_id FROM board_members WHERE user_id = $1))
            ORDER BY board_members.board_id, users.id
        `, [userId]);


        const boardMembers = boardMembersQuery.rows;  // เก็บข้อมูลสมาชิก + board_id ของแต่ละคน

        // ส่งข้อมูล boards ไปยัง board.ejs
        res.render('board', {
            takeBoard: boards,  // รายชื่อบอร์ดที่ผู้ใช้เป็นเจ้าของ
            boardOwners: boardOwners, // ส่งข้อมูลเจ้าของบอร์ด
            boardMembers: boardMembers,  // รายชื่อสมาชิกในบอร์ด
            user: req.session.user,
            pageTitle: 'Board Page'
        });
    } catch (err) {
        console.error('Error in getBoardPage:', err);
        res.status(500).send('Server error in getBoardPage');
    }
};

exports.postBoardPage = async (req, res) => {
    try {
        // console.log("Received body:", req.body);
        // console.log("User session:", req.session.user); // เช็กค่าที่ส่งมา

        const { postboard } = req.body;
        const ownerId = req.session.user ? req.session.user.id : null; // ดึง user id

        if (!postboard || postboard.trim() === '') {
            return res.status(400).send('Board name is required');
        }

        if (!ownerId) {
            return res.status(403).send('Unauthorized: User not logged in');
        }

        const insertBoard = 'INSERT INTO boards(name, owner_id) VALUES ($1, $2) RETURNING *';
        await db.query(insertBoard, [postboard, ownerId]);
        res.redirect('/board');
    } catch (err) {
        console.error('Error in postBoardPage:', err);
        res.status(500).send('Server error in postBoardPage');
    }
}

exports.updateBoard = async (req, res) => {
    try {
        // console.log(req.body); // ใช้เพื่อดีบักว่า request body มีข้อมูลหรือไม่

        const { id } = req.params;
        let { newboardsName } = req.body;  // ดึง newName จาก body
        const userId = req.session.user ? req.session.user.id : null; // ตรวจสอบ user ที่ล็อกอิน

        // ตรวจสอบว่า user ล็อกอินแล้ว
        if (!userId) {
            return res.status(403).json({ success: false, message: 'Unauthorized: Please login' });
        }

        // ตรวจสอบว่า id เป็นตัวเลขจริง ๆ
        if (!id || isNaN(id)) {
            return res.status(400).json({ success: false, message: 'Invalid Board ID' });
        }

        // ตรวจสอบว่า newName มีค่าหรือไม่
        if (!newboardsName || newboardsName.trim() === '') {
            return res.status(400).json({ success: false, message: 'Board name is required' });
        }

        newboardsName = newboardsName.trim(); // ตัดช่องว่างที่ไม่จำเป็น

        // เช็คว่า Board มีอยู่จริงก่อนอัปเดต
        const board = await db.query('SELECT * FROM boards WHERE id = $1', [id]);
        if (board.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Board not found' });
        }

        // ตรวจสอบว่า user เป็นเจ้าของบอร์ด
        if (board.rows[0].owner_id !== userId) {
            return res.status(403).json({ success: false, message: 'You are not authorized to edit this board' });
        }

        // อัปเดตชื่อ Board
        await db.query('UPDATE boards SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newboardsName, id]);

        res.json({ success: true, message: 'Board updated successfully' });
    } catch (err) {
        console.error('Error in updateBoard:', err);
        res.status(500).json({ success: false, message: 'Server error in updateBoard' });
    }
};

exports.deleteBoard = async (req, res) => {
    const { id } = req.params;
    const userId = req.session.user ? req.session.user.id : null; // ตรวจสอบ user ที่เข้าสู่ระบบ

    // ตรวจสอบว่า id เป็นตัวเลขจริง ๆ
    if (!id || isNaN(id)) {
        return res.status(400).json({ success: false, message: 'Invalid Board ID' });
    }

    // ตรวจสอบว่า user ล็อกอินแล้ว
    if (!userId) {
        return res.status(403).json({ success: false, message: 'Unauthorized: Please login' });
    }

    try {
        // เช็คว่าบอร์ดมีอยู่จริงก่อนลบ
        const board = await db.query('SELECT * FROM boards WHERE id = $1', [id]);
        if (board.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Board not found' });
        }

        // ตรวจสอบว่า user เป็นเจ้าของบอร์ด
        const boardOwner = board.rows[0].owner_id;
        if (userId !== boardOwner) {
            return res.status(403).json({ success: false, message: 'You are not authorized to delete this board' });
        }

        // ดึงรายการคอลัมน์ที่เกี่ยวข้องกับบอร์ด
        const columns = await db.query('SELECT id FROM board_columns WHERE board_id = $1', [id]);
        const columnIds = columns.rows.map(col => col.id);

        if (columnIds.length > 0) {
            // ลบ Tasks ที่เกี่ยวข้องกับคอลัมน์ทั้งหมดของบอร์ด
            await db.query('DELETE FROM tasks WHERE board_columns_id = ANY($1)', [columnIds]);
        }

        // ลบสมาชิกที่อยู่ในบอร์ดนี้
        await db.query('DELETE FROM board_members WHERE board_id = $1', [id]);
        // ลบ Columns ที่เกี่ยวข้องกับบอร์ด
        await db.query('DELETE FROM board_columns WHERE board_id = $1', [id]);
        // ลบ Board
        await db.query('DELETE FROM boards WHERE id = $1', [id]);

        res.json({ success: true, message: 'Board deleted successfully' });
    } catch (err) {
        console.error('Error in deleteBoard:', err);
        res.status(500).json({ success: false, message: 'Server error in deleteBoard' });
    }
};

exports.updateInBoard = async (req, res) => {
    try {
        // console.log('Request Body:', req.body); // Debug: ตรวจสอบค่า req.body
        // console.log('Request Params:', req.params); // Debug: ตรวจสอบค่า req.params

        const { id } = req.params;
        let { newboardsName, newDescription } = req.body;  // ดึง newName จาก body
        const userId = req.session.user ? req.session.user.id : null; // ตรวจสอบ user ที่ล็อกอิน

        // ตรวจสอบว่า id เป็นตัวเลขจริง ๆ
        if (!id || isNaN(id)) {
            return res.status(400).json({ success: false, message: 'Invalid Board ID' });
        }

        newboardsName = newboardsName.trim(); // ตัดช่องว่างที่ไม่จำเป็น
        newDescription = newDescription.trim(); // ตัดช่องว่างที่ไม่จำเป็น

        // ตรวจสอบว่า newName มีค่าหรือไม่
        if (!newboardsName) {
            return res.status(400).json({ success: false, message: 'Board name are required' });
        }

        // ตรวจสอบว่า user ล็อกอินแล้ว
        if (!userId) {
            return res.status(403).json({ success: false, message: 'Unauthorized: Please login' });
        }

        // เช็คว่า Board มีอยู่จริงก่อนอัปเดต
        const board = await db.query('SELECT * FROM boards WHERE id = $1', [id]);
        if (board.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Board not found' });
        }

        // ตรวจสอบว่า user เป็นเจ้าของบอร์ด
        const boardOwner = board.rows[0].owner_id;
        if (userId !== boardOwner) {
            return res.status(403).json({ success: false, message: 'You are not authorized to update this board' });
        }

        // อัปเดตชื่อ Board
        await db.query('UPDATE boards SET name = $1, updated_at = CURRENT_TIMESTAMP, description = $2 WHERE id = $3', [newboardsName, newDescription, id]);

        res.json({ success: true, message: 'Board updated successfully' });
    } catch (err) {
        console.error('Error in updateInBoard:', err);
        res.status(500).json({ success: false, message: 'Server error in updateInBoard' });
    }
};
