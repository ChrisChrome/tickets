const config = require("./config.json");
const express = require("express");
const app = express();
const port = config.port;
const session = require("express-session");
const bcrypt = require("bcrypt");
const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("database.db");
const SQLiteStore = require('connect-sqlite3')(session);

// Init DB if new
db.run( // Create users table
	"CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT, password TEXT, authLevel INTEGER)"
);
db.run( // Create tickets table
	"CREATE TABLE IF NOT EXISTS tickets (id INTEGER PRIMARY KEY, title TEXT, description TEXT, status INTEGER, user INTEGER, priority INTEGER(1), createdTimestamp INTEGER, updatedTimestamp INTEGER, messages TEXT, FOREIGN KEY(user) REFERENCES users(id))"
);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: config.security.sessionSecret, resave: false, saveUninitialized: true, store: new SQLiteStore({ db: "sessions.db" }) }));
app.set("view engine", "ejs");
app.set("views", "views");
// Custom middleware to update the session user data if the user is updated or deleted
app.use((req, res, next) => {
	if (req.session.authenticated) {
		getUser(req.session.username)
			.then((user) => {
				if (!user) {
					req.session.destroy();
					return res.redirect("/login");
				}
				req.session.userData = { username: user.username, id: user.id, authLevel: user.authLevel };
				next();
			})
			.catch((err) => {
				console.error(err);
				res.status(500).send("Internal Server Error");
			});
	} else {
		next();
	}
});

// Helper functions

// basic password generator
const genPass = () => {
	return Array.from({ length: 24 }, () => {
		const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?";
		return charset[Math.floor(Math.random() * charset.length)];
	}).join("");
}

// Create user
const createUser = (username, password, authLevel) => {
	return new Promise((resolve, reject) => {
		bcrypt.hash(password, config.security.saltRounds, (err, hash) => {
			if (err) {
				console.error(err);
				reject(err);
				return;
			}
			db.run(
				"INSERT INTO users (username, password, authLevel) VALUES (?, ?, ?)",
				[username, hash, authLevel],
				(err) => {
					if (err) {
						console.error(err);
						reject(err);
						return;
					}
					resolve();
				}
			);
		});
	});
};

// Delete user
const deleteUser = (username) => {
	return new Promise((resolve, reject) => {
		db.run("DELETE FROM users WHERE username = ?", [username], (err) => {
			if (err) {
				console.error(err);
				reject(err);
				return;
			}
			resolve();
		});
	});
};

// Update user
const updateUser = (username, password, authLevel) => {
	return new Promise((resolve, reject) => {
		bcrypt.hash(password, config.security.saltRounds, (err, hash) => {
			if (err) {
				console.error(err);
				reject(err);
				return;
			}
			db.run(
				"UPDATE users SET password = ?, authLevel = ? WHERE username = ?",
				[hash, authLevel, username],
				(err) => {
					if (err) {
						console.error(err);
						reject(err);
						return;
					}
					resolve();
				}
			);
		});
	});
};

// Get user
const getUser = (username) => {
	return new Promise((resolve, reject) => {
		db.get("SELECT * FROM users WHERE username = ?", [username], (err, row) => {
			if (err) {
				console.error(err);
				reject(err);
				return;
			}
			resolve(row);
		});
	});
};

// Check if user is authenticated
const isAuthenticated = (req, res, next) => {
	if (req.session.authenticated) {
		// Check that the user still exists // TODO: Move this to a helper function
		// TODO: Check that the user and session are still valid, in case the user was deleted or the session was invalidated
		return next();
	}
	res.redirect("/login");
};

// Create a ticket
const createTicket = (title, description, status, user, priority) => {
	// createdTimestamp is right now, updated will be null
	// messages will contain the description as the first message. this is an array of objects
	/* message obj
	{
		timestamp: put_timestamp_here,
		user: {
			username: "name",
			id: X, // user id
			authLevel: X // 0 or 1
		},
		message: put_message_here
	}
	*/
	return new Promise((resolve, reject) => {
		const timestamp = Date.now();
		const messages = JSON.stringify([{ timestamp, user, message: description }]);
		db.run(
			"INSERT INTO tickets (title, description, status, user, priority, createdTimestamp, updatedTimestamp, messages) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
			[title, description, status, JSON.stringify(user), priority, timestamp, null, messages],
			function (err) {
				if (err) {
					console.error(err);
					reject(err);
					return;
				}

				resolve(this.lastID);
			}
		);
	});
};

// Delete a ticket (probably won't be used other than debugging)
const deleteTicket = (id) => {
	return new Promise((resolve, reject) => {
		db.run("DELETE FROM tickets WHERE id = ?", [id], (err) => {
			if (err) {
				console.error(err);
				reject(err);
				return;
			}
			resolve();
		});
	});
};

// sortTickets, sort tickets by status (closed last, then pending, then open), then by priority (1-5), then by createdTimestamp
const sortTickets = (tickets) => {
	return tickets.sort((a, b) => {
		if (a.status === b.status) {
			if (a.priority === b.priority) {
				return b.createdTimestamp - a.createdTimestamp;
			}
			return b.priority - a.priority;
		}
		return b.status - a.status;
	});
};


// Routes
app.get("/", (req, res) => {
	res.redirect("/dashboard");
});

app.get("/login", (req, res) => {
	res.render("login");
});

app.post("/login", (req, res) => {
	const { username, password } = req.body;
	db.get("SELECT * FROM users WHERE username = ?", [username], (err, row) => {
		if (err) {
			console.error(err);
			return res.status(500).send("Internal Server Error");
		}
		if (!row) {
			return res.status(401).send("Invalid username or password");
		}
		bcrypt.compare(password, row.password, (err, result) => {
			if (err) {
				console.error(err);
				return res.status(500).send("Internal Server Error");
			}
			if (!result) {
				return res.status(401).send("Invalid username or password");
			}
			req.session.authenticated = true;
			req.session.username = username;
			req.session.uid = row.id;
			req.session.authLevel = row.authLevel;
			req.session.userData = { username, id: row.id, authLevel: row.authLevel };

			res.redirect("/dashboard");
		});
	});
});

app.get("/dashboard", isAuthenticated, (req, res) => {
	// Auth 0 Only show own tickets, Auth 1 show all tickets
	switch (req.session.authLevel) {
		case 0:
			// get all tickets, then filter out the ones that aren't the user's
			db.all("SELECT * FROM tickets", (err, rows) => {
				if (err) {
					console.error(err);
					return res.status(500).send("Internal Server Error");
				}
				const userTickets = rows.filter((ticket) => {
					return JSON.parse(ticket.user).id === req.session.userData.id;
				});
				res.render("dashboard", { username: req.session.username, tickets: sortTickets(userTickets) });
			});
			break;
		case 1:
			// If ?user=X is set, only show tickets from that user
			if (req.query.user) {
				db.all("SELECT * FROM tickets WHERE user = ?", [req.query.user], (err, rows) => {
					if (err) {
						console.error(err);
						return res.status(500).send("Internal Server Error");
					}
					res.render("dashboard", { username: req.session.username, tickets: sortTickets(rows) });
				});
				return;
			} else {
				db.all("SELECT * FROM tickets", (err, rows) => {
					if (err) {
						console.error(err);
						return res.status(500).send("Internal Server Error");
					}
					res.render("dashboard", { username: req.session.username, tickets: sortTickets(rows) });
				});
			}
			break;
	}
});

app.get("/logout", isAuthenticated, (req, res) => {
	req.session.destroy();
	res.redirect("/login");
});

// Ticket manipulation
// Create a ticket
app.get("/ticket/create", isAuthenticated, (req, res) => {
	res.render("createTicket");
});

app.post("/ticket/create", isAuthenticated, (req, res) => {
	const { title, description, priority } = req.body;
	createTicket(title, description, 0, req.session.userData, priority)
		.then((ticId) => {
			res.redirect(`/ticket/${ticId}`);
		})
		.catch((err) => {
			console.error(err);
			res.status(500).send("Internal Server Error");
		});
});

// View a ticket
app.get("/ticket/:id", isAuthenticated, (req, res) => {
	// if not admin or ticket owner, return 403

	db.get("SELECT * FROM tickets WHERE id = ?", [req.params.id], (err, row) => {
		if (err) {
			console.error(err);
			return res.status(500).send("Internal Server Error");
		}
		if (!row) {
			return res.status(404).send("Ticket not found");
		}
		// Check if user is allowed to view ticket
		if (req.session.authLevel === 0 && JSON.parse(row.user).id !== req.session.userData.id) {
			return res.status(403).send("Forbidden");
		}
		// Parse user and messages from JSON
		row.user = JSON.parse(row.user);
		row.messages = JSON.parse(row.messages);
		res.render("viewTicket", { ticket: row });
	});
});

// Update a ticket (/ticket/:id/:action)
app.post("/ticket/:id/:action", isAuthenticated, (req, res) => {
	// if not admin or ticket owner, return 403
	// if action is not valid, return 400
	// if action is not valid for user, return 403
	// if action is not valid for ticket, return 400
	// if action is valid, update ticket and redirect to ticket, unless delete, then go to dashboard
	// Check if ticket exists
	db.get("SELECT * FROM tickets WHERE id = ?", [req.params.id], (err, row) => {
		if (err) {
			console.error(err);
			return res.status(500).send("Internal Server Error");
		}
		if (!row) {
			return res.status(404).send("Ticket not found");
		}
		// Parse user and messages from JSON
		row.user = JSON.parse(row.user);
		row.messages = JSON.parse(row.messages);
		if (row.user.id !== req.session.userData.id && req.session.authLevel === 0) {
			return res.status(403).send("Forbidden");
		}
		// Check if action is valid
		switch (req.params.action) {
			case "delete":
				// Delete ticket
				db.run("DELETE FROM tickets WHERE id = ?", [req.params.id], (err) => {
					if (err) {
						console.error(err);
						return res.status(500).send("Internal Server Error");
					}
					res.redirect("/dashboard");
				});
				break;
			case "add-message":
				// Add message
				const timestamp = Date.now();
				row.messages.push({ timestamp, user: req.session.userData, message: req.body.message });
				db.run("UPDATE tickets SET messages = ? WHERE id = ?", [JSON.stringify(row.messages), req.params.id], (err) => {
					if (err) {
						console.error(err);
						return res.status(500).send("Internal Server Error");
					}
					// Update last updated timestamp
					db.run("UPDATE tickets SET updatedTimestamp = ? WHERE id = ?", [timestamp, req.params.id], (err) => {
						if (err) {
							console.error(err);
							return res.status(500).send("Internal Server Error");
						}
						res.redirect(`/ticket/${req.params.id}`);
					});
				});
				break;
			case "status": // Update status, 0 1 or 2
				// Check if status is valid
				if (req.body.status < 0 || req.body.status > 2) {
					return res.status(400).send("Invalid status");
				}
				// Update status
				db.run("UPDATE tickets SET status = ? WHERE id = ?", [req.body.status, req.params.id], (err) => {
					if (err) {
						console.error(err);
						return res.status(500).send("Internal Server Error");
					}
					// Update timestamp
					db.run("UPDATE tickets SET updatedTimestamp = ? WHERE id = ?", [Date.now(), req.params.id], (err) => {
						if (err) {
							console.error(err);
							return res.status(500).send("Internal Server Error");
						}
						res.redirect(`/ticket/${req.params.id}`);
					});
				});
				break;

			case "priority": // Update priority, 1 thru 5
				// Check if priority is valid
				if (req.body.priority < 1 || req.body.priority > 5) {
					return res.status(400).send("Invalid priority");
				}
				// Update priority
				db.run("UPDATE tickets SET priority = ? WHERE id = ?", [req.body.priority, req.params.id], (err) => {
					if (err) {
						console.error(err);
						return res.status(500).send("Internal Server Error");
					}
					// Update timestamp
					db.run("UPDATE tickets SET updatedTimestamp = ? WHERE id = ?", [Date.now(), req.params.id], (err) => {
						if (err) {
							console.error(err);
							return res.status(500).send("Internal Server Error");
						}
						res.redirect(`/ticket/${req.params.id}`);
					});
				});
				break;

		}
	});
});

// User manipulation
// Non admins can change own password, admins can create user, delete user, change own password, change other user password
// Create user
app.get("/settings", isAuthenticated, (req, res) => {
	res.render("settings");
});

app.post("/user/create", isAuthenticated, (req, res) => {
	if (req.session.authLevel === 0) {
		return res.status(403).send("Forbidden");
	}
	const { username, password, authLevel } = req.body;
	createUser(username, password, authLevel)
		.then(() => {
			res.redirect("/dashboard");
		})
		.catch((err) => {
			console.error(err);
			res.status(500).send("Internal Server Error");
		});
});

app.post("/user/delete", isAuthenticated, (req, res) => {
	if (req.session.authLevel === 0) {
		return res.status(403).send("Forbidden");
	}
	const { username } = req.body;
	deleteUser(username)
		.then(() => {
			res.redirect("/dashboard");
		})
		.catch((err) => {
			console.error(err);
			res.status(500).send("Internal Server Error");
		});
});

app.post("/user/update", isAuthenticated, (req, res) => {
	// TODO: Allow user to update their own password
});

app.get("/admin/createUser", isAuthenticated, (req, res) => {
	// Check if user is admin
	if (req.session.authLevel !== 1) {
		return res.status(403).send("Forbidden");
	}
	res.render("admin/createUser");
});

app.post("/admin/createUser", isAuthenticated, (req, res) => {
	// Check if user is admin
	if (req.session.authLevel !== 1) {
		return res.status(403).send("Forbidden");
	}
	const { username, password, authLevel } = req.body;
	createUser(username, password, authLevel)
		.then(() => {
			res.redirect("/dashboard");
		})
		.catch((err) => {
			console.error(err);
			res.status(500).send("Internal Server Error");
		});
});

app.get("/admin/deleteUser", isAuthenticated, (req, res) => {
	// Check if user is admin
	if (req.session.authLevel !== 1) {
		return res.status(403).send("Forbidden");
	}
	res.render("admin/deleteUser");
});

app.post("/admin/deleteUser", isAuthenticated, (req, res) => {
	// Check if user is admin
	if (req.session.authLevel !== 1) {
		return res.status(403).send("Forbidden");
	}
	const { username } = req.body;
	deleteUser(username)
		.then(() => {
			res.redirect("/dashboard");
		})
		.catch((err) => {
			console.error(err);
			res.status(500).send("Internal Server Error");
		});
});

app.get("/admin/updateUser", isAuthenticated, (req, res) => {
	// Check if user is admin
	if (req.session.authLevel !== 1) {
		return res.status(403).send("Forbidden");
	}
	res.render("admin/updateUser");
})

app.post("/admin/updateUser", isAuthenticated, (req, res) => { // username is only required field, all others are optional. Get the users data, and update the fields that are set
	// Check if user is admin
	if (req.session.authLevel !== 1) {
		return res.status(403).send("Forbidden");
	}
	const { username, password, authLevel } = req.body;
	updateUser(username, password, authLevel)
		.then(() => {
			res.redirect("/dashboard");
		})
		.catch((err) => {
			console.error(err);
			res.status(500).send("Internal Server Error");
		});
});

app.get("/admin/listUsers", isAuthenticated, (req, res) => {
	// Check if user is admin
	if (req.session.authLevel !== 1) {
		return res.status(403).send("Forbidden");
	}
	db.all("SELECT * FROM users", (err, rows) => {
		if (err) {
			console.error(err);
			return res.status(500).send("Internal Server Error");
		}
		res.render("admin/listUsers", { users: rows });
	});
});

app.listen(port, () => {
	console.log(`Server listening on port ${port}`);
	// If users table is empty create an admin user
	db.get("SELECT * FROM users", (err, row) => {
		if (err) {
			console.error(err);
			return;
		}
		if (!row) {
			let pass = genPass();
			createUser("admin", pass, 1)
				.then(() => {
					console.log(`Admin user created. Username: admin, Password: ${pass}`);
				})
				.catch((err) => {
					console.error(err);
				});
		}
	});
});