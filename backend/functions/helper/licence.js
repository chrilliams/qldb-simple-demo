const { Result, TransactionExecutor } = require('amazon-qldb-driver-nodejs');
const { getQldbDriver } = require('./ConnectToLedger');
const LicenceIntegrityError = require('../lib/LicenceIntegrityError');
const LicenceNotFoundError = require('../lib/LicenceNotFoundError');
const Log = require('@dazn/lambda-powertools-logger');


const createLicence = async (name, email, telephone, postcode, event) => {
    Log.debug(`In createLicence function with name: ${name} email ${email} telephone ${telephone} and postcode ${postcode}`);

    let licence;
    // Get a QLDB Driver instance
    const qldbDriver = await getQldbDriver();
    await qldbDriver.executeLambda(async (txn) => {
        // Check if the record already exists assuming email unique for demo
        const recordsReturned = await checkEmailUnique(txn, email);
        if (recordsReturned === 0) {
            const licenceDoc = [{"Name": name, "Email": email, "Telephone": telephone, "Postcode": postcode, "PenaltyPoints": 0, "Events": event  }]
            // Create the record. This returns the unique document ID in an array as the result set
            const result = await createBicycleLicence(txn, licenceDoc);
            const docIdArray = result.getResultList()
            const docId = docIdArray[0].get("documentId").stringValue();
            // Update the record to add the document ID as the GUID in the payload
            await addGuid(txn, docId, docId.toUpperCase(), name);
            licence = {
                "GUID": docId,
                "LicenceId": docId.toUpperCase(),
                "Name": name,
                "PenaltyPoints": 0,
                "Email": email,
                "Telephone": telephone,
                "Postcode": postcode
            };
        } else {
            throw new LicenceIntegrityError(400, 'Licence Integrity Error', `Licence record with email ${email} already exists. No new record created`);
        }
    }, () => Log.info("Retrying due to OCC conflict..."));
    return licence;
};

// helper function to check if the email address is already registered
async function checkEmailUnique(txn, email) {
    Log.debug("In checkEmailUnique function");
    const query = `SELECT Email FROM BicycleLicence AS b WHERE b.Email = ?`;
    let recordsReturned;
    await txn.execute(query, email).then((result) => {
        recordsReturned = result.getResultList().length;
        recordsReturned === 0 ? Log.debug(`No records found for ${email}`) : Log.debug(`Record already exists for ${email}`);
    });
    return recordsReturned;
};

// helper function to create a new licence record
async function createBicycleLicence(txn, licenceDoc) {
    Log.debug("In the createBicycleLicence function");
    const statement = `INSERT INTO BicycleLicence ?`;
    return await txn.execute(statement, licenceDoc);
};

// helper function to add the unique ID as the GUID
async function addGuid(txn, id, licenceId, name) {
    Log.debug("In the addGuid function");
    const statement = `UPDATE BicycleLicence as b SET b.GUID = ?, b.LicenceId = ? WHERE b.Name = ?`;
    return await txn.execute(statement, id, licenceId, name);
};


// Function to add or remove penalty points on a licence
const updateLicence = async (email, event) => {
    Log.debug(`In updateLicence function with email ${email} and event ${event}`);

    let licence;
    // Get a QLDB Driver instance
    const qldbDriver = await getQldbDriver();
    await qldbDriver.executeLambda(async (txn) => {
        // Get the current record

        const result = await getLicenceRecordByEmail(txn, email);
        const resultList = result.getResultList();

        if (resultList.length === 0) {
            throw new LicenceIntegrityError(400, 'Licence Integrity Error', `Licence record with email ${email} does not exist`);
        } else {
            const originalLicence = JSON.stringify(resultList[0]);
            const newLicence = JSON.parse(originalLicence);
            const originalPoints = newLicence.PenaltyPoints;
            const updatedPoints = event.penaltyPoints;
            let newPoints = null;
            if (event.eventName == "PenaltyPointsAdded") {
                newPoints = originalPoints + updatedPoints;
            } else {
                newPoints = originalPoints - updatedPoints;
            }

            const events  = newLicence.Events;
            events.unshift(event);
            const updateResult = await addEvent(txn, newPoints, events, email);
            licence = {
                "Email": email,
                "UpdatedPenaltyPoints": newPoints,
            };
        }
    }, () => Log.info("Retrying due to OCC conflict..."));
    return licence;
};

// Function to contact details on a licence
const updateContact = async (telephone, postcode, email, event) => {
    Log.debug(`In updateContact function with telephone ${telephone} postcode ${postcode} email ${email} and event ${event}`);

    let licence;
    // Get a QLDB Driver instance
    const qldbDriver = await getQldbDriver();
    await qldbDriver.executeLambda(async (txn) => {
        // Get the current record

        const result = await getLicenceRecordByEmail(txn, email);
        const resultList = result.getResultList();

        if (resultList.length === 0) {
            throw new LicenceIntegrityError(400, 'Licence Integrity Error', `Licence record with email ${email} does not exist`);
        } else {
            const originalLicence = JSON.stringify(resultList[0]);
            const newLicence = JSON.parse(originalLicence);
            const events  = newLicence.Events;
            events.unshift(event);
            telephone === undefined ? telephone = newLicence.Telephone : null;
            postcode === undefined ? postcode = newLicence.Postcode : null;
            const updateResult = await addContactUpdatedEvent(txn, telephone, postcode, events, email);
            licence = {
                "Email": email,
                "Response": "Contact details updated"
            };
        }
    }, () => Log.info("Retrying due to OCC conflict..."));
    return licence;
};

async function getLicenceRecordByEmail(txn, email) {
    Log.debug("In getLicenceRecordByEmail function");
    const query = `SELECT * FROM BicycleLicence AS b WHERE b.Email = ?`;
    return txn.execute(query, email);
};

async function getLicenceRecordById(txn, id) {
    Log.debug("In getLicenceRecordById function");
    const query = `SELECT * FROM BicycleLicence AS b WHERE b.LicenceId = ?`;
    return txn.execute(query, id);
};

// helper function to update the penalty points and events
async function addEvent(txn, points, event, email) {
  Log.debug("In the addEvent function");
  const statement = `UPDATE BicycleLicence as b SET b.PenaltyPoints = ?, b.Events = ? WHERE b.Email = ?`;
  return await txn.execute(statement, points, event, email);
};

// helper function to add ta contact updated event
async function addContactUpdatedEvent(txn, telephone, postcode, event, email) {
    Log.debug(`In the addContactUpdatedEvent function with telephone ${telephone} and postcode ${postcode}`);
    const statement = `UPDATE BicycleLicence as b SET b.Telephone = ?, b.Postcode = ?, b.Events = ? WHERE b.Email = ?`;
    return await txn.execute(statement, telephone, postcode, event, email);
};

// helper function to delete a record by LicenceId
async function deleteLicenceRecordById(txn, id) {
    Log.debug("In deleteLicenceRecordById function");
    const query = `DELETE FROM BicycleLicence AS b WHERE b.LicenceId = ?`;
    return txn.execute(query, id);
};


// Function to retrieve the current state of a licence
const getLicence = async (id) => {
    Log.debug(`In getLicence function with LicenceId ${id}`);

    let licence;
    // Get a QLDB Driver instance
    const qldbDriver = await getQldbDriver();
    await qldbDriver.executeLambda(async (txn) => {
        // Get the current record
        const result = await getLicenceRecordById(txn, id);
        const resultList = result.getResultList();

        if (resultList.length === 0) {
            throw new LicenceNotFoundError(400, 'Licence Not Found Error', `Licence record with LicenceId ${id} does not exist`);
        } else {
            licence = JSON.stringify(resultList[0]);
        }
    }, () => Log.info("Retrying due to OCC conflict..."));
    return licence;
};


// Function to retrieve the current state of a licence
const deleteLicence = async (id) => {
    Log.debug(`In deleteLicence function with LicenceId ${id}`);

    let licence;
    // Get a QLDB Driver instance
    const qldbDriver = await getQldbDriver();
    await qldbDriver.executeLambda(async (txn) => {
        // Get the current record
        const result = await getLicenceRecordById(txn, id);
        const resultList = result.getResultList();

        if (resultList.length === 0) {
            throw new LicenceNotFoundError(400, 'Licence Not Found Error', `Licence record with LicenceId ${id} does not exist`);
        } else {
            const updateResult = await deleteLicenceRecordById(txn, id);
            licence = `{"Response": "Licence record deleted"}`;
        }
    }, () => Log.info("Retrying due to OCC conflict..."));
    return licence;
};


module.exports = {
    createLicence,
    updateLicence,
    getLicence,
    updateContact,
    deleteLicence
}