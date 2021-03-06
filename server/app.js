const path = require('path');
const express = require('express');
const app = express();
// const server = require('http').Server(app);
// const io = require('socket.io')(server)
const sqlite3 = require('sqlite3').verbose();
const SerialPort = require('serialport');
const moment = require('moment');

const hostname = 'localhost';
const port = 3000;

const os = require('os');

let myPathIs = '';
let myIPAddress = '';
let interfaces = os.networkInterfaces();
if (os.platform == 'win32') {
    myPathIs = 'COM4';
    myIPAddress = interfaces['Wi-Fi'][1]['address'];

} else if (os.platform == 'linux') {
    myPathIs = '/dev/ttyACM0';
    myIPAddress = interfaces['wlan0'][0]['address'];
}

const formidable = require('formidable');
const fs = require('fs');

// følgende linje hvis brug af socket io
// server.listen(port, () => console.log(`GreenSense app listening at http://${hostname}:${port}`));
app.listen(port, () => {
    console.log(`GreenSense app listening at http://${hostname}:${port}`);
    console.log(`You can find it at: http://${myIPAddress}:${port}`);

});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/myprofile', (req, res) => res.sendFile(path.join(__dirname, 'profile.html')));
app.get('/contact', (req, res) => res.sendFile(path.join(__dirname, 'contact.html')));
app.get('/buy', (req, res) => res.sendFile(path.join(__dirname, 'buy.html')));

app.get('/client.js', (req, res) => res.sendFile(path.join(__dirname, 'client.js')));

app.get('/img/logo.png', (req, res) => res.sendFile(path.join(__dirname, 'img', 'logo.png')));

app.get('/img/picture-*.jpg', (req, res) => res.sendFile(path.join(__dirname, req.url.replace(req.baseUrl + "/", ""))));
app.get('/img/userpicture.jpg', (req, res) => res.sendFile(path.join(__dirname, 'img', 'userpicture.jpg')));

app.get('/database', (req, res) => {
    let response = [];

    // henter kun fra de sidste 24 timer (84600 sekunder)
    let sql = `SELECT * from GreenSense WHERE Timestamp >= ${(moment().unix() - 86400).toString()} ORDER BY Timestamp ASC;`;
    
    db.each(sql, (err, row) => {
        if (err) {
            return console.error(err);
        }
        // console.log(rows);
        response.push(row);
    }, () => {
        res.json(JSON.stringify(response));
    });

});

// Gør det muligt for brugeren at uploade et billede af sin plante
app.post('/myprofile/uploadnewpicture', function (req, res) {
    var form = new formidable.IncomingForm();
    form.parse(req, function (err, fields, file) {
        var oldpath = file['files[]']['path'];
        var newpath = path.join(__dirname, 'img', 'userpicture.jpg');
        fs.rename(oldpath, newpath, function (err) {
            if (err) throw err;
            console.log('Billedet er ændret.');
            res.send('File uploaded and moved!');
        });
    });
});

const usbPath = myPathIs;
const Readline = require('@serialport/parser-readline');
const usbPort = new SerialPort(usbPath, { baudRate: 9600 });

const parser = new Readline();
usbPort.pipe(parser);

let db = new sqlite3.Database('./arduinoData.db', (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to my database.');
});

let latestWaterTime = 0;

parser.on('data', function (line) {
    // push new data to database
    console.log(`Received from Arduino: ${line}`);
    let dataSplit = line.split(';');
    let timestamp = moment().unix();
    let temperature = dataSplit[0].split('=')[1];
    let humidity = dataSplit[1].split('=')[1];
    let waterlevel = dataSplit[4].split('=')[1];
    let photocellValue = dataSplit[2].split('=')[1];
    let moistureValue = dataSplit[3].split('=')[1];
    let values = [timestamp, temperature, humidity, waterlevel, photocellValue, moistureValue];
    let placeholder = values.join(', ');
    let sql = "INSERT INTO GreenSense (Timestamp, Temperature, Humidity, Waterlevel, Lightsensitivity, Moisture) VALUES (" + placeholder + ");";

    db.run(sql, (err) => {
        if (err) {
            return console.error(err.message);
        }
        console.log('The data was succesfully added to the database.');
    });

    // hvis vand niveauet er for lavt og der er gået 10 minutter, vand planten
    if (parseInt(moistureValue) < 20 && (latestWaterTime + 60*10) < moment().unix()) {
        // vand plante
        latestWaterTime = moment().unix();
        console.log(`Vander planten automatisk nu (${moment().format('lll')})`)
        usbPort.write('water\n', (err) => {
            if (err) {
                return console.error(err);
            }
        });
    }
});

// vand plante
app.post('/waterplant', (req, res) => {
    console.log('Planten vandes nu...');

    usbPort.write('water\n', (err) => {
        if (err) {
            return console.error(err);
        }
    });

    res.send('Succes');
});

process.on('SIGINT', () => {
    console.log("Closing...");
    db.close((err) => {
        if (err) {
            console.error(err.message);
        }
        console.log('Disconnected from database.');
        process.exit();
    })
});