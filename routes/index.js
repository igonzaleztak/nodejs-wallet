const common = require("../libs/common.js");



/**
 * Gets the last five blocks
 * @param {Client} ethClient 
 */
function getLastBlocks(ethClient) {
  return async function (req, res) {
    let navParams = await common.getNavParams(req, ethClient);

    let blocks = await common.getLastsBlocks(ethClient.web3);

    // Get latest token transactions
    let transfers = await ethClient.balanceSC.getPastEvents('Transfer', {fromBlock: 0});
    res.render('public/home', {arrayBlocks: blocks, navParams: navParams, transfers: transfers.reverse()});
  }
}


/**
 * Shows block parameters
 * @param {Client} ethClient 
 */
function showBlockInfo(ethClient) {
  return async function (req, res) {

    let navParams = await common.getNavParams(req, ethClient);
    let blockNumber = req.params.hash;
    let block = await ethClient.web3.eth.getBlock(blockNumber);
    let time = common.tm(block.timestamp);
    res.render('public/blocks', {block: block, time: time, navParams: navParams});
  }
}


/**
 * Show transaction info
 * @param {Client} ethClient 
 */
function showTxInfo(ethClient) {
  return async function (req, res) {
    let navParams = await common.getNavParams(req, ethClient);

    let txHash = req.params.hash;
    let tx = await ethClient.web3.eth.getTransaction(txHash);
    let block = await ethClient.web3.eth.getBlock(tx.blockNumber);
    let time = common.tm(block.timestamp);
    res.render('public/tx', {tx: tx, time: time, navParams: navParams});
  }
}

function showData(ethClient) {
  return async function (req, res) {
    let navParams = await common.getNavParams(req, ethClient);

    let arrayData = await common.getDataAvailable(ethClient);
    res.render('public/data', {arrayData: arrayData, navParams: navParams})
  }
}


/**
 * Checks whether a user has access to the Blockchain:
 *  - Gets the user's private key
 *  - Creates a session cookie
 * @param {Client} ethClient 
 */
function authenticate(ethClient) {
  return function (req, res) {
    // Get the body of the message
    let body = "";
    req.on('data', chunk => 
    {
      body += chunk;
    });
  
    req.on('end', async function(){
      let bodyObject = JSON.parse(body);

      // Check if the login is correct
      common.authenticateUser(ethClient, bodyObject.account, bodyObject.password, function(err, account, password, privKey) {
        if (err){
          res.status(401);
          res.end();
          return;
        }
        console.log("User " + account + " has been authenticated");
      
        req.session.userID = account;
        req.session.privKey = privKey;
        req.session.pubKey = "04" + common.getPublicKey(privKey);
  
        res.cookie('userAccount', ethClient.web3.utils.toChecksumAddress(account));
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end();
      });
    });
  }
}

module.exports = {
  getLastBlocks,
  showBlockInfo,
  showTxInfo,
  showData,
  authenticate
}