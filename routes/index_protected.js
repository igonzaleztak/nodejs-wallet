const common = require("../libs/common.js");
const ecies = require('eciesjs');


/**
 * Destroys session cookie and redirects user to /
 */
function logout() {
  return function(req, res) {
    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          res.status(401);
          res.end();
          return ;
        }
        res.status(200);
        res.end();
      });
    }
  }
}

/**
 * Renders the user's wallet webpage.
 * From this webpage users can check their purchases
 * and purchase new measurements
 * @param {Client configuration} ethClient 
 */
function renderWallet(ethClient) {
  return async function (req, res) {
    // Get the client's address form the session cookie
    let address = req.session.userID;

    // Get the top navigation bar parameters
    let navParams = await common.getNavParams(req, ethClient);

    // Filter the purchases made by the user
    let filter = {
      _from: ethClient.web3.utils.toChecksumAddress(address)
    };
    let purchasesArray = await ethClient.balanceSC.getPastEvents('CompletePurchase', {filter, fromBlock: 0})
    .catch((err) => {console.log(err);});

    // Prepare displayed Data
    let purchases = [];
    for (let i = purchasesArray.length - 1; i >= 0; i--) {
      let blockNumber = purchasesArray[i].blockNumber;
      let hash = purchasesArray[i].returnValues._hash;
      let txHash = purchasesArray[i].returnValues._txHash;
      let price = await ethClient.balanceSC.methods.getPriceMeasurement(hash).call();

      purchases.push({
        blockNumber: blockNumber,
        hash: hash,
        txHash: txHash,
        price: price
      });
    }

    res.render('private/wallet', {navParams: navParams, purchases: purchases});

  }
}


/**
 * Purchases a measurement
 * @param {Client Config} ehtClient 
 */
function purchaseMeasurement(ethClient) {
  return function(req, res) {
    // Get the body of the message
    let body = "";
    req.on('data', chunk => 
    {
      body += chunk;
    });
    
    req.on('end', async function() {
      let jsonBody = JSON.parse(body);
      let hash = jsonBody.hash;
      
      // Recover the user's address and private key from
      // the cookie session
      let address = ethClient.web3.utils.toChecksumAddress(req.session.userID);
      let privKey = req.session.privKey;

      // Get the public key of the client
      let pubKey = req.session.pubKey;

      // Store the client's public key in the blockchain
      await common.sendTransactionContract(ethClient.web3
        , ethClient.accessSC.methods.addPubKey(pubKey)
        , privKey);
      
      // Check if the client has already bought the measurement
      let filter = {
          _from: ethClient.web3.utils.toChecksumAddress(address),
          _hash: hash
      };
      
      // Get all the events that matches the previous filter
      let events = await ethClient.balanceSC.getPastEvents('RequestPurchase', { filter, fromBlock: 0 });

      if (events.length != 0) {
        res.status(500);
        res.end();
        return;
      }

      // Get the price of the measurement
      let price = await ethClient.balanceSC.methods.getPriceMeasurement(hash).call();

      // Check user's balance
      let balance = await ethClient.balanceSC.methods.balanceOf(address).call();

      if (balance < price ) {
        res.status(421);
        res.end();
        return;
      }

      // Purchase the measurement
      await common.sendTransactionContract(ethClient.web3
        , ethClient.balanceSC.methods.purchaseMeasurement(hash)
        , privKey)

      res.status(200);
      res.end();
    });
  }
}


/**
 * Gets the value of the measurement purchased by the client
 * @param {Client} ethClient 
 */
function valueMeasurement(ethClient) {
  return async function(req, res) {

    // Get the hash of the measurement
    let hash = req.params.hash;
    let clientAddr = ethClient.web3.utils.toChecksumAddress(req.session.userID);

    // Get client's private key
    let privKey = req.session.privKey;

    // Get the transaction hash that contains the 
    // encrypted URL
    let filter = {
      _hash: hash,
      _from: clientAddr
    };
    let events = await ethClient.balanceSC.getPastEvents('CompletePurchase', {filter, fromBlock: 0});
    let txHash = events[events.length - 1].returnValues._txHash;

    // Get IoT address
    let iotAddr = (await ethClient.dataSC.methods.ledger(hash).call()).addr;

    // Get the encrypted url
    let secret = (await ethClient.web3.eth.getTransaction(txHash)).input;

    // Decrypt the URL and the symmetric key using the clients private key
    let plainData = ecies.decrypt(Buffer.from(privKey.substring(2), 'hex'), Buffer.from(secret.substring(2), 'hex'));
    let symmetricKey = plainData.slice(0, 32);
    let cid = String(plainData.slice(32));

    // Query the url to obtain the data
    let encryptedData = await common.fetchIPFSData(ethClient.config.IPFSaddr, cid);

    // Decipher the measurement using the symmetric key
    let plain = common.decryptAES(symmetricKey, encryptedData);

    let measurement = plain.slice(0, plain.length-65 );
    let signature = plain.slice(plain.length-64);

    let r = ethClient.web3.utils.bytesToHex(signature.slice(0, 32));
    let s =  ethClient.web3.utils.bytesToHex(signature.slice(32));


    // Get the top navigation bar parameters  
    let navParams = await common.getNavParams(req, ethClient);

    res.render('private/measurement', {
      navParams: navParams, 
      hash: hash, 
      measurement: measurement,
      txHash: txHash,
      clientAddr: clientAddr,
      iotAddr: iotAddr,
      r: r,
      s: s
    });
  }
}


module.exports = {
  renderWallet,
  purchaseMeasurement,
  logout,
  valueMeasurement
}