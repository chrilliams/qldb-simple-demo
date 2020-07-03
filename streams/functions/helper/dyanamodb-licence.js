
const DynamoDB = require('aws-sdk/clients/dynamodb')
const dynamodb = new DynamoDB.DocumentClient();

const TABLE_NAME = process.env.TABLE_NAME;

const createLicence = async (id, points, postcode) => {
    console.log("In createLicence function");
    const params = {
        TableName: TABLE_NAME,
        Item: {
          'pk': id,
          'penaltyPoints': points,
          'postcode': postcode
        },
    };

    await dynamodb.put(params).promise().then((response) => {
      console.log('Create licence:', id, response);

    }).catch(err => {
      console.error('Unable to create licence', id, '. Error JSON:', JSON.stringify(err, null, 2));


    });
};

const deleteLicence = async (id) => {
    const params = {
        TableName: TABLE_NAME,
        Key: { 'pk': id }
    };

    await dynamodb.delete(params).promise().then((response) => {
      console.log('Delete licence:', id, response);

    }).catch(err => {
      console.error('Unable to delete licence', id, '. Error JSON:', JSON.stringify(err, null, 2));

    });
};


const getLicence = async (id) => {
    console.log("In getLicence function");
    console.log(`About to call dynamodb.get`);
    const licence = await dynamodb.get({
        TableName: TABLE_NAME,
        Key: { 'pk': id },
      });
    console.log(`Return from call dynamodb.get`);
    return {
        'id': licence.Item.pk,
        'penaltyPoints': licence.Item.penaltyPoints,
        'postcode': licence.Item.postcode
    }
};


const updateLicence = async (id, points, postcode) => {
  console.log(JSON.stringify(TABLE_NAME));

    const params = {
        TableName: TABLE_NAME,
        Key: { 'pk': id },
        UpdateExpression: 'set penaltyPoints=:points, postcode=:code',
        ExpressionAttributeValues:{
            ':points':points,
            ':code':postcode
        }
    };

    await dynamodb.update(params).promise().then((response) => {
      console.log('UpdateItem licence:', id, response);

    }).catch(err => {
      console.error('Unable to update licence', id, '. Error JSON:', JSON.stringify(err, null, 2));

    });

};

module.exports = {
    createLicence,
    deleteLicence,
    updateLicence,
    getLicence
}