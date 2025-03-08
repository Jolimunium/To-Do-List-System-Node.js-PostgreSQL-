const db = require('../db');

exports.inboard = async (req, res) => {
    try {
        const userId = req.session.user ? req.session.user.id : null;

        if (!userId) {
            return res.status(403).send('Unauthorized: Please login');
        }

        const { id } = req.params;
        // console.log(req.params)

        // ดึงข้อมูลบอร์ดจากฐานข้อมูล
        const board = await db.query('SELECT * FROM boards WHERE id = $1', [id]);
        const result = await db.query(
            'SELECT * FROM board_columns WHERE board_id = $1',
            [id]
        );
        const tasks = await db.query(
            'SELECT * FROM tasks WHERE board_columns_id IN (SELECT id FROM board_columns WHERE board_id = $1) ORDER BY updated_at DESC',
            [id]
        );

        // ตรวจสอบว่าบอร์ดมีอยู่ในฐานข้อมูล
        if (board.rows.length === 0) {
            return res.status(404).send('Board not found');
        }

        // ดึงข้อมูลเจ้าของบอร์ด
        const boardOwnerQuery = await db.query(`
                    SELECT users.username, boards.owner_id
                    FROM boards
                    INNER JOIN users ON boards.owner_id = users.id
                    WHERE boards.id = $1
                `, [id]);

        const boardOwner = boardOwnerQuery.rows[0]; // เจ้าของบอร์ด

        // ดึงสมาชิกทั้งหมดที่ยังไม่ได้เข้าร่วมบอร์ด (ไม่รวมเจ้าของบอร์ด)
        const usersQuery = await db.query(`
            SELECT id, username 
            FROM users 
            WHERE id != (SELECT owner_id FROM boards WHERE id = $1)
        `, [id]);

        // ตรวจสอบว่า user เป็นเจ้าของหรือสมาชิกของบอร์ด
        const boardMembersQuery = await db.query(`
            SELECT 1
            FROM board_members 
            WHERE board_id = $1 AND user_id = $2
        `, [id, userId]);

        // ถ้าไม่ใช่เจ้าของหรือสมาชิก
        if (board.rows[0].owner_id !== userId && boardMembersQuery.rows.length === 0) {
            return res.status(403).send('Unauthorized: You are not a member or owner of this board');
        }

        // ดึงข้อมูลสมาชิกในบอร์ด (ถ้าเป็นเจ้าของหรือสมาชิก)
        const boardMembers = await db.query(`
            SELECT users.id, users.username
            FROM users
            INNER JOIN board_members ON users.id = board_members.user_id
            WHERE board_members.board_id = $1
        `, [id]);


        // ส่งข้อมูลบอร์ดไปยังหน้า view
        res.render('inboard', {
            takeBoard: board.rows[0],
            boardOwner: boardOwner, // ส่งข้อมูลเจ้าของบอร์ด
            allUsers: usersQuery.rows,  // รายชื่อคนที่ยังไม่ได้เข้าร่วม
            boardMembers: boardMembers.rows, // รายชื่อสมาชิกในบอร์ด
            pageTitle: 'In Board Page',
            user: req.session.user,
            columns: result.rows, // ส่งข้อมูลคอลัมน์ใหม่ที่เพิ่มเข้ามาด้วย
            tasks: tasks.rows,
            boardId: id,
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
};

exports.addColumn = async (req, res) => {
    try {
        const { columnId } = req.params;
        const { columnName } = req.body;

        // console.log('Received params:', req.params);  // ตรวจสอบ boardId
        // console.log('Received body:', req.body);      // ตรวจสอบ columnName


        if (!columnName) {
            return res.status(400).send('Column name is required');
        }
        if (!columnId) {
            return res.status(400).send('Board ID is required');
        }

        // ตรวจสอบว่า board มีอยู่จริงหรือไม่
        const boardResult = await db.query('SELECT * FROM boards WHERE id = $1', [columnId]);
        if (boardResult.rows.length === 0) {
            return res.status(404).send('Board not found');
        }

        // เพิ่มคอลัมน์ลงฐานข้อมูล
        const result = await db.query(
            'INSERT INTO board_columns (board_id, name) VALUES ($1, $2) RETURNING *',
            [columnId, columnName]
        );

        // รีเฟรชข้อมูลบอร์ดและคอลัมน์ทั้งหมด
        const columnsResult = await db.query('SELECT * FROM board_columns WHERE board_id = $1', [columnId]);

        // console.log('Inserted Column:', result.rows[0]); // เช็กข้อมูลที่ถูก INSERT
        res.status(200).json({
            takeBoard: boardResult.rows[0],
            columns: columnsResult.rows,
            newColumn: result.rows[0] // ส่งข้อมูลคอลัมน์ใหม่ที่เพิ่มเข้ามาด้วย
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.editColumn = async (req, res) => {
    try {
        const { columnId } = req.params;
        const { columnName } = req.body;

        // console.log('Received params:', req.params);
        // console.log('Received body:', req.body);

        if (!columnName) {
            return res.status(400).send('Column name is required');
        }

        // ตรวจสอบว่าคอลัมน์มีอยู่จริงหรือไม่
        const columnResult = await db.query('SELECT * FROM board_columns WHERE id = $1', [columnId]);
        if (columnResult.rows.length === 0) {
            return res.status(404).send('Column not found');
        }

        // อัปเดตคอลัมน์
        const result = await db.query(
            'UPDATE board_columns SET name = $1 WHERE id = $2 RETURNING *',
            [columnName, columnId]
        );

        // console.log('Updated Column:', result.rows[0]);
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.deleteColumn = async (req, res) => {
    try {
        const { columnId } = req.params; // รับค่า columnId จาก params

        // console.log('Received columnId:', columnId);

        if (!columnId) {
            return res.status(400).send('Column ID is required');
        }

        // ตรวจสอบว่าคอลัมน์มีอยู่ในฐานข้อมูลหรือไม่
        const columnResult = await db.query('SELECT * FROM board_columns WHERE id = $1', [columnId]);
        if (columnResult.rows.length === 0) {
            return res.status(404).send('Column not found');
        }

        // ลบ Task ที่เกี่ยวข้องกับคอลัมน์นี้ก่อน (ถ้ามี)
        await db.query('DELETE FROM tasks WHERE board_columns_id = $1 RETURNING *', [columnId]);

        // ลบคอลัมน์
        const result = await db.query('DELETE FROM board_columns WHERE id = $1 RETURNING *', [columnId]);

        if (result.rows.length === 0) {
            return res.status(404).send('Column deletion failed');
        }

        // console.log('Deleted Column:', result.rows[0]);

        // รีเฟรชข้อมูลบอร์ดและคอลัมน์ทั้งหมด
        const columnsResult = await db.query('SELECT * FROM board_columns WHERE board_id = $1', [result.rows[0].board_id]);

        // ส่งข้อมูลใหม่ที่หลังจากลบคอลัมน์
        res.status(200).json({
            columns: columnsResult.rows,
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.addTask = async (req, res) => {
    try {
        const { columnId } = req.params;
        const { taskName, taskDescription } = req.body;

        // console.log('Received params:', req.params);  // ตรวจสอบ boardId
        // console.log('Received body:', req.body);      // ตรวจสอบ columnName

        // เพิ่มข้อมูลลงในฐานข้อมูล
        const result = await db.query(
            'INSERT INTO tasks (board_columns_id, name, description) VALUES ($1, $2, $3) RETURNING *',
            [columnId, taskName, taskDescription]
        );

        // console.log('Inserted Task:', result.rows[0]); // ตรวจสอบข้อมูลที่เพิ่ม
        res.json(result.rows[0]); // ส่ง Task ที่เพิ่มกลับไป
    } catch (err) { // แก้ไขตรงนี้
        console.error(err);
        res.status(500).send('Server Error');
    }
}

exports.editTask = async (req, res) => {
    try {
        const { taskId } = req.params;
        const { taskName, taskDescription } = req.body;

        // console.log('Received params:', req.params);  // ตรวจสอบ taskId
        // console.log('Received body:', req.body);      // ตรวจสอบข้อมูลที่ส่งมา

        // อัปเดตข้อมูลในฐานข้อมูล
        const result = await db.query(
            'UPDATE tasks SET name = $1, description = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
            [taskName, taskDescription, taskId]
        );

        if (result.rowCount === 0) {
            return res.status(404).send('Task not found');
        }

        // console.log('Updated Task:', result.rows[0]); // ตรวจสอบข้อมูลที่อัปเดต
        res.json(result.rows[0]); // ส่ง Task ที่แก้ไขกลับไป
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

exports.deleteTask = async (req, res) => {
    try {
        const { taskId } = req.params;

        if (!taskId) {
            return res.status(400).send('Task ID is required');
        }

        // ลบ Task จากฐานข้อมูล
        const result = await db.query('DELETE FROM tasks WHERE id = $1 RETURNING *', [taskId]);

        if (result.rows.length === 0) {
            return res.status(404).send('Task not found');
        }

        // console.log('Deleted Task:', result.rows[0]); // เช็กข้อมูลที่ถูกลบ
        res.status(200).send('Task successfully deleted');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};



exports.update_members = async (req, res) => {
    try {
        const { selectedMembers, unselectedMembers, boardId } = req.body;

        if (!boardId) {
            return res.json({ success: false, message: 'Board not found.' });
        }

        // ตรวจสอบว่าบอร์ดมีอยู่จริงหรือไม่
        const boardResult = await db.query('SELECT owner_id FROM boards WHERE id = $1', [boardId]);
        if (boardResult.rows.length === 0) {
            return res.json({ success: false, message: 'Board not found.' });
        }

        const boardOwnerId = boardResult.rows[0].owner_id;

        // ตรวจสอบว่าผู้ที่ส่งคำเชิญเป็นเจ้าของบอร์ด
        if (boardOwnerId !== req.session.user.id) {
            return res.json({ success: false, message: 'Only the board owner can update members.' });
        }

        // ลบสมาชิกที่ไม่ได้เลือกออกจาก board_members
        for (const memberId of unselectedMembers) {
            await db.query('DELETE FROM board_members WHERE board_id = $1 AND user_id = $2', [boardId, memberId]);
        }

        // เพิ่มสมาชิกที่เลือกเข้าไปใน board_members
        for (const memberId of selectedMembers) {
            // ตรวจสอบว่ามีสมาชิกนี้อยู่ใน board_members หรือไม่
            const existingMember = await db.query('SELECT 1 FROM board_members WHERE board_id = $1 AND user_id = $2', [boardId, memberId]);
            if (existingMember.rows.length === 0) {
                await db.query('INSERT INTO board_members (board_id, user_id) VALUES ($1, $2)', [boardId, memberId]);
            }
        }

        res.json({ success: true, message: 'Members updated successfully.' });
    } catch (error) {
        console.error(error);
        res.json({ success: false, message: 'An error occurred while updating members.' });
    }
};
