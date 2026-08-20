const mongoose = require("mongoose");

// Connects the NodeJS application to MongoDB Atlas and returns the result.
const dbconnect = async (connectSrting) => {
  return await mongoose
    .connect(connectSrting)
    .then((data) => {
      // Shows the connected database host in the terminal.
      console.log(`Database connected: ${data.connection.host}`);
      return true;
    })

    .catch((error) => {
      // Shows the connection error and tells index.js not to start the server.
      console.log(error);
      return false;
    });
};

module.exports = { dbconnect };
