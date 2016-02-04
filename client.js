'use strict';

const electron = require('electron');
// Module to control application life.
const app = electron.app;
// Module to create native browser window.
const BrowserWindow = electron.BrowserWindow;

//var ejs = require('electron-ejs')(app);

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;

function createWindow () {
  // Create the browser window.
  mainWindow = new BrowserWindow({width: 800, height: 600});

  mainWindow.webContents.on('did-start-loading', function() {
    //mainWindow.webContents.executeJavaScript("var $ = jQuery = require('jquery'), window.async = window.async = require('async'), io = require('socket.io-client'), mainWindow = require('remote').getCurrentWindow();");
    mainWindow.webContents.executeJavaScript("var mainWindow = require('remote').getCurrentWindow();");
    //mainWindow.webContents.executeJavaScript("window.$ = window.jQuery = require('jquery');");
    //mainWindow.webContents.executeJavaScript("window.async = window.async = require('async');");
    //mainWindow.webContents.executeJavaScript("window.io = io = require('socket.io-client');");
  });

  // and load the index.html of the app.
  mainWindow.loadURL('file://' + __dirname + '/dist/client.ejs');

  // Open the DevTools.
  mainWindow.webContents.openDevTools();

  // Emitted when the window is closed.
  mainWindow.on('closed', function() {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;
  });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.on('ready', createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', function () {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow();
  }
});
