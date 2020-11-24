const fs = require('fs');
const Wallet = require('ethereumjs-wallet');
const crypto = require('crypto');
const secp256k1 = require('secp256k1');


/**
 * Initializes an instance of the contractç
 * @param {web3}   Web3
 * @param {Object} abi 
 * @param {String} addr
 * @returns Contract 
 */
function initContract(web3, abi, addr)
{
  return new web3.eth.Contract(abi, addr);
}

/**
 * Gets the last 5 blocks mined in the Blockchain
 * @param {Web3} web3 
 */
async function getLastsBlocks(web3)
{
  // Get the last block
  let lastBlock = await web3.eth.getBlockNumber();

  // Get the last 5 blocks
  blockArray = [];
  for(let i = lastBlock; i >= lastBlock - 5; i--) {
    let block = await web3.eth.getBlock(i);
    blockArray.push(block)
  }
  return blockArray;
}

/**
 * Converts the UNIX timestamp to date
 * @param {Uint} unix_tm 
 */
function tm(unix_tm) {
  let dt = new Date(unix_tm*1000);
  return `${dt.getDay()}-${dt.getMonth()}-${dt.getFullYear()} ${dt.toTimeString()}`;
}


/**
 * Returns the measurements which are available to be purchased
 * @param {Client} ethClient 
 */
async function getDataAvailable(ethClient) {
  let response = [];

  // Read the events, associated to the insertion of new measurements, 
  // emitted in the data contract
  let arrayData = await ethClient.dataSC.getPastEvents('evtStoreInfo', {fromBlock: 0});

  for (let i = arrayData.length - 1; i >= 0; i--)
  {
    // Extract the fields of interest from the bundle
    let hash = arrayData[i].returnValues._hash;
    let description =  arrayData[i].returnValues._description;
    let txHash = arrayData[i].transactionHash;

    // Get the price of the data
    let price = await ethClient.balanceSC.methods.getPriceMeasurement(hash).call();

    // Append the measurement to the response empty array
    response.push({
      price: price,
      transactionHash: txHash,
      description: description,
      hash: hash
    });

  }

  // Extract the interesting parameters
  return response;
}

/**
 * Get the file, which contains the parameters to extract the
 * private key of an ethereum account.
 * @param {String} path 
 * @param {String} pattern
 * @return {String} 
 */
function getFilesFromPath(path, pattern)
{
  let dir = fs.readdirSync(path);
  let match = (dir.filter( fn => fn.match(pattern)))[0];

  let keyJSON = JSON.parse(fs.readFileSync(path + "/" + match));

  return keyJSON;
}


/**
 * Recovers the private key of the client
 * @param {Web3} web3
 * @param {String} account 
 * @param {String} password
 * @return {String} privateKey 
 */
function getPrivateKey(web3, folder, account, password)
{
  // Get the UTC file that has the parameters to extract the 
  // private key   
  let pattern = new RegExp(".*" + account.substring(2), "i");
  let keyJSON;
  try {
    keyJSON = getFilesFromPath(folder, pattern);
  } catch (err) {
    console.log(err);
    return null;
  }

  return (web3.eth.accounts.decrypt(keyJSON, password)).privateKey;
}

/**
 * Compares if the password introduced by the user is correct
 * @param {String} account 
 * @param {String} passwordHash 
 * @param {callback} callback 
 * @return Callback(error, account)
 */
let authenticateUser = async function(ethClient, account, password, callback)
{
  // Get the client's private key from the wallet
  let privKey = getPrivateKey(ethClient.web3, ethClient.config.nodePath + "keystore", account, password);  

  // If the password is correct then the privatekey will be different than null
  if (privKey) return callback(null, account, password, privKey);
  else 
  {
    let err = new Error("The account and/or the password  you introduced are wrong");
    return callback(err, null, null, null);
  }
};



/**
 * Gets the parameters the user's parameters to display
 * them in the top navigation bar
 * @param {Request} req
 * @param {Client} ethClient 
 */
async function getNavParams(req, ethClient) {
  let isLoggedin = false;
  let balance, symbol, account;

  // Check whether the user is loggin or not to include
  // the partial ejs
  if (req.session.userID != null) {
    isLoggedin = true;
    // get the account
    account = req.session.userID;

    // Get the user's balance and the symbol of the token
    balance = await ethClient.balanceSC.methods.balanceOf(ethClient.web3.utils.toChecksumAddress(account)).call();
    symbol = await ethClient.balanceSC.methods.symbol().call();
  }

  return {
    isLoggedin: isLoggedin,
    balance: balance,
    symbol: symbol,
    account: account
  };
}

/**
 * Gets the public key of the client from his private key
 * @param {String} privateKey 
 * @return {String} publicKey
 */
function getPublicKey(privateKey)
{
  let privateKeyBuffer =Buffer.from(privateKey.substring(2), 'hex');
  let wallet = Wallet.default.fromPrivateKey(privateKeyBuffer);
  
  return wallet.getPublicKey().toString('hex');
}

/**
 * Sends signed transaction to a smart contract method 
 * @param {Web3} web3 
 * @param {Transaction} transaction 
 * @param {String} privKey 
 */
async function sendTransactionContract(web3, transaction, privKey)
{
  let options =  
  {
    to: 			transaction._parent._address,
    data: 		transaction.encodeABI(),
    gasPrice: '0',
    gas:	400000
  };

  let signedTransaction = await web3.eth.accounts.signTransaction(options, privKey);
  let receipt = await web3.eth.sendSignedTransaction(signedTransaction.rawTransaction);

  return receipt;
}

/**
 * Signs the hash of the message
 * @param {String} message 
 * @param {String} privateKey 
 * @returns {Object} hash signed
 */
function signMessage(message, privateKey) 
{
  // Hash the message and sign it
  let hash = crypto.createHash('SHA256').update(message).digest(); 
  let sig = secp256k1.ecdsaSign(hash, Buffer.from(privateKey.substring(2), 'hex'))
  return sig;
}


/**
 * Converts Uint8Array to hex string
 * @param {Uint8Array} arrayBuffer 
 */
function buf2hex(arrayBuffer) 
{
  let buff = new Uint8Array(arrayBuffer);
  return Buffer.from(buff).toString('hex');
}


module.exports = {
  initContract, 
  getLastsBlocks,
  tm,
  getDataAvailable,
  authenticateUser,
  getNavParams,
  getPublicKey,
  sendTransactionContract,
  signMessage,
  buf2hex
}
