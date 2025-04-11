const mineflayer = require('mineflayer');
const Movements = require('mineflayer-pathfinder').Movements;
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const { GoalBlock } = require('mineflayer-pathfinder').goals;

const config = require('./settings.json');
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Bot is online');
});

app.listen(8000, () => {
  console.log('Web server started on port 8000');
});

const keep_alive = require('./keep_alive.js');

function createBot() {
  const bot = mineflayer.createBot({
    username: config['bot-account']['username'],
    password: config['bot-account']['password'],
    auth: config['bot-account']['type'],
    host: config.server.ip,
    port: config.server.port,
    version: config.server.version,
  });

  bot.loadPlugin(pathfinder);
  const mcData = require('minecraft-data')(bot.version);
  const defaultMove = new Movements(bot, mcData);
  bot.settings.colorsEnabled = false;

  let pendingPromise = Promise.resolve();
  let startX, startY, startZ;
  let initializedPath = false;
  let current = 0;
  let intervalID = null;

  function sendRegister(password) {
    return new Promise((resolve, reject) => {
      bot.chat(`/register ${password} ${password}`);
      bot.once('chat', (username, message) => {
        if (message.includes('successfully registered') || message.includes('already registered')) {
          resolve();
        } else {
          reject(`[Register] Unexpected message: ${message}`);
        }
      });
    });
  }

  function sendLogin(password) {
    return new Promise((resolve, reject) => {
      bot.chat(`/login ${password}`);
      bot.once('chat', (username, message) => {
        if (message.includes('successfully logged in')) {
          resolve();
        } else {
          reject(`[Login] Unexpected message: ${message}`);
        }
      });
    });
  }

  bot.once('spawn', () => {
    console.log('[INFO] Bot spawned');

    if (config.utils['auto-auth'].enabled) {
      const password = config.utils['auto-auth'].password;
      pendingPromise = pendingPromise
        .then(() => sendRegister(password))
        .then(() => sendLogin(password))
        .catch(console.error);
    }

    if (config.utils['chat-messages'].enabled) {
      const messages = config.utils['chat-messages']['messages'];
      if (config.utils['chat-messages'].repeat) {
        let i = 0;
        setInterval(() => {
          bot.chat(messages[i]);
          i = (i + 1) % messages.length;
        }, config.utils['chat-messages']['repeat-delay'] * 1000);
      } else {
        messages.forEach(msg => bot.chat(msg));
      }
    }

    if (config.utils['anti-afk'].enabled) {
      bot.setControlState('jump', true);
      if (config.utils['anti-afk'].sneak) {
        bot.setControlState('sneak', true);
      }
    }
  });

  bot.on('goal_reached', () => {
    if (!initializedPath) {
      const pos = bot.entity.position;
      startX = Math.floor(pos.x);
      startY = Math.floor(pos.y);
      startZ = Math.floor(pos.z);
      initializedPath = true;
      bot.pathfinder.setMovements(defaultMove);

      const relativePoints = [
        [1, 0], [1, 1], [0, 1], [-1, 1],
        [-1, 0], [-1, -1], [0, -1], [1, -1],
      ];

      intervalID = setInterval(() => {
        const [dx, dz] = relativePoints[current];
        const x = startX + dx;
        const z = startZ + dz;
        bot.pathfinder.setGoal(new GoalBlock(x, startY, z));

        bot.setControlState('jump', true);
        setTimeout(() => bot.setControlState('jump', false), 300);

        current = (current + 1) % relativePoints.length;
      }, 5000);
    }
  });

  bot.on('death', () => {
    console.log(`[AfkBot] Bot died at ${bot.entity.position}`);
  });

  if (config.utils['auto-reconnect']) {
    bot.on('end', () => {
      setTimeout(() => createBot(), config.utils['auto-recconect-delay']);
    });
  }

  bot.on('kicked', reason => {
    console.log(`[AfkBot] Bot was kicked. Reason: ${reason}`);
  });

  bot.on('error', err => {
    console.log(`[ERROR] ${err.message}`);
  });
}

createBot();
