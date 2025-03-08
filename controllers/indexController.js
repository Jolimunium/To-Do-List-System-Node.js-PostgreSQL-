module.exports=(req, res) => {
    res.render('index', { user: req.session.user, pageTitle: 'Home'  });
};
