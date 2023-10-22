const express = require('express');
const path = require('path');
const app = express();
const { WebSocketServer } = require('ws');
const canvasSize = { width: 300, height: 200};

app.use(express.static(path.join(__dirname, 'build')));

app.get('/ping', function (req, res) {
  return res.send('pong');
});

app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(process.env.PORT || 8080);

const wsServer = new WebSocketServer({ port: 4040 });

const arraySize = canvasSize.width * canvasSize.height * 4;
var bitmapDataMemory = new Uint8Array(arraySize);
var index = 0;
while(index < arraySize) bitmapDataMemory[index++] = 255;


function ApplyDifference(bitmapData,changes, width, height)
{
  for(const change of changes)
  {
    bitmapData[change.index] = change.r;
    bitmapData[change.index + 1] = change.g;
    bitmapData[change.index + 2] = change.b;
    bitmapData[change.index + 3] = change.a;
  }
}


function sendUdpatedUserList() {
  Array.from(wsServer.clients).forEach((client) => 
    client.send(JSON.stringify({
      messageType: 'updateUserList',
      data: Array.from(wsServer.clients).map((client) => ({userName: client.userName, color: client.color}))
    })));
}

wsServer.on('connection', (ws,req) => {
  var url = require('url');
  const parameters = url.parse(req.url, true);
  ws.id = parameters.query.id;
  console.log(`WS client (id:${ws.id}) connected`);

  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    var error = false;

    switch(message.messageType)
    {
      case 'updateBitmap':
        //one of the client is drawing
        //first we update the local representation of the whiteboard
        ApplyDifference(bitmapDataMemory,message.data, canvasSize.width, canvasSize.height)

        //then we broadcast the changes to all OTHER the update data
        Array.from(wsServer.clients).forEach((client) => {
          if(client.id != ws.id)
            client.send(JSON.stringify({
              messageType: 'updateBitmap',
              data: message.data
            }));
          }
        );
        break;

      case 'updateUser':
        //new user, we store user information in the socket object
        ws.userName = message.data.userName;
        ws.color = message.data.color;

        //we send the newly connected user the current state of the whiteboard
        ws.send(JSON.stringify({
          messageType: 'initBitmap',
          data: bitmapDataMemory
        }));
                
        //then broadcast to all the updated user list
        sendUdpatedUserList();
        break;

      default:
        ws.send(
          JSON.stringify({
            messageType: 'error',
            data: 'Client sent an unrecognized message format',
            originalMessage: message,
          })
        );
      }
  });

  ws.on('close', () => {
    //one less client, update the list for other clients
    sendUdpatedUserList();
    console.log('WS client disconnected.');
  });

  ws.onerror = console.error;
});
