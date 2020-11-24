const https = require('https');
const Web3 = require('web3');
const net = require('net');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const session = require('express-session');

const common = require("./libs/common.js");

const routes = require('./routes/index');
const protectedRoutes = require('./routes/index_protected');


/***************** Global variables *********************/
// JSON object with the configuration of the server
const ConfigServer = require("./config/config.json")

// TLS variables
const options = 
{
  key: fs.readFileSync('certs/private-key.pem'),
  cert: fs.readFileSync('certs/public-cert.pem')
};

// Express variables
const app = express();

// set the view engine to ejs
app.set('view engine', 'ejs');


// Use CORS to allow connection with the ethereum node
app.use(cors());

// Config express-session
let sess = {
  secret: crypto.randomBytes(32).toString('hex'), // Used to sign the session ID cookie
  cookie: {},
  resave: false,
  saveUninitialized: false
};

app.use(session(sess));

/******************** Function init() ************************/
/**
 * Read the configuration file
 */
function init()
{
  // Initialize the ethereum client
  const web3 = new Web3(`${ConfigServer.nodePath}geth.ipc`, net);

  // Initialize the access smart contract
  const AccessABI = require("./contracts/access.json");
  let accessSC = common.initContract(web3, AccessABI, ConfigServer.accessContractAddr);

  // Initialize balance smart contract
  const BalanceABI = require("./contracts/balance.json");
  let balanceSC = common.initContract(web3, BalanceABI, ConfigServer.balanceContractAddr);

  // Intialize data smart contract
  const DataABI = require("./contracts/data.json");
  let dataSC = common.initContract(web3, DataABI, ConfigServer.dataContractAddr);

  // Create struct that stores these parameters
  let ethClient = {"web3": web3, "accessSC": accessSC, "balanceSC":balanceSC, "dataSC": dataSC, "config": ConfigServer};

  return ethClient;
}


/**
 * Creates a middleware that requires a login for certain pages
 * @param {Request} req 
 * @param {Response} res 
 * @param {Next} next 
 */
function requiresLogin(req, res, next)
{
  if (req.session && req.session.userID) return next();
  else 
  {
    res.redirect('/')
    res.status(404);
    res.end();
    return ;
  }
}



/**
 * Main function
 */
function main()
{
  console.log("+ Initializing server\n");
  let ethClient = init();

  app.use(express.static(__dirname + '/views/public'));

  // Public routes
  app.get('/', routes.getLastBlocks(ethClient));
  app.get('/blocks/:hash', routes.showBlockInfo(ethClient));
  app.get('/tx/:hash', routes.showTxInfo(ethClient));
  app.get('/data', routes.showData(ethClient));
  app.get('/login', (req, res) => {res.render('public/login');});

  // Login XHR request 
  app.post('/auth', routes.authenticate(ethClient));

  // Private routes
  app.route('/wallet').get(requiresLogin, protectedRoutes.renderWallet(ethClient));
  app.route('/logout').post(requiresLogin, protectedRoutes.logout(ethClient));
  app.route('/purchase').post(requiresLogin, protectedRoutes.purchaseMeasurement(ethClient));
  app.route('/measurement/:hash').get(requiresLogin, protectedRoutes.valueMeasurement(ethClient));


  // Create the https server
  console.log("Listening to secure messages in port: " + ethClient.config.HTTPport);
  https.createServer(options, app).listen(ethClient.config.HTTPport);
}

main()

