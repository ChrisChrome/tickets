# Ticket page

A super basic, full of issues ticketing system for me to keep track of things I need to do. Also learning more about express, ejs, and proper, secure authentication.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [Contributing](#contributing)
- [License](#license)

## Installation

### Requirements
- Node.js
- npm
- Possibly a reverse proxy server (like nginx) to handle SSL and other things.

### Steps
1. Clone the repository
2. Run `npm install` to install dependencies
3. Create a `config.json` file in the root directory with the following contents:
```json
{
	"port": "3000",
	"security": {
		"saltRounds": 10,
		"sessionSecret": "TestingSecretChangeMe"
	}
}
```
4. Run `node .` to start the server. You can also use a process manager like pm2 to keep the server running.

- You can now reach the server at `http://localhost:3000` (or whatever port you specified in the `config.json` file).
- Default administrator login is `admin` with password `admin`. You should change this immediately.

## TODO

- [ ] Add a user-friendly way to update user credentials (You can do basic stuff at /admin/createUser, /admin/deleteUser, /admin/updateUser, adn /admin/listUsers)
- [ ] Add a way for non-admins to update their own password

## License
This project is licensed under the GNU General Public License v3.0. You can find the full text of the license in the [LICENSE](./LICENSE) file.

## Notes

- This project was made with the help of GitHub Copilot. I did not write all of the code myself, but I did write a majority of it. I am not responsible for any security vulnerabilities or other issues that may arise from using this project. Use at your own risk.