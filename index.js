const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals: { GoalBlock } } = require('mineflayer-pathfinder');
const mcDataLoader = require('minecraft-data');
const express = require('express');
const config = require('./settings.json');
const keep_alive = require('./keep_alive.js');

const app = express();
app.get('/', (req, res) => res.send('Bot has arrived'));
app.listen(8000, () => console.log('Server started'));

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
  bot.settings.colorsEnabled = false;

  bot.once('spawn', () => {
    console.log('\x1b[33m[AfkBot] Bot joined the server\x1b[0m');

    const mcData = mcDataLoader(bot.version);
    const defaultMove = new Movements(bot, mcData);

    // Auto-Auth
    if (config.utils['auto-auth'].enabled) {
      console.log('[INFO] Started auto-auth module');
      const password = config.utils['auto-auth'].password;

      function sendRegister(password) {
        return new Promise((resolve, reject) => {
          bot.chat(`/register ${password} ${password}`);
          bot.once('chat', (username, message) => {
            if (message.includes('successfully registered') || message.includes('already registered')) resolve();
            else reject(`Register failed: ${message}`);
          });
        });
      }

      function sendLogin(password) {
        return new Promise((resolve, reject) => {
          bot.chat(`/login ${password}`);
          bot.once('chat', (username, message) => {
            if (message.includes('successfully logged in')) resolve();
            else reject(`Login failed: ${message}`);
          });
        });
      }

      sendRegister(password)
        .then(() => sendLogin(password))
        .catch(err => console.log('[Auth ERROR]', err));
    }

    // Auto-Chat
    if (config.utils['chat-messages'].enabled) {
      console.log('[INFO] Started chat-messages module');
      const messages = config.utils['chat-messages']['messages'];
      const delay = config.utils['chat-messages']['repeat-delay'];
      if (config.utils['chat-messages'].repeat) {
        let i = 0;
        setInterval(() => {
          bot.chat(messages[i]);
          i = (i + 1) % messages.length;
        }, delay * 1000);
      } else {
        messages.forEach(msg => bot.chat(msg));
      }
    }

    // Kreisbewegung starten (3x3 + springen)
    const startX = Math.floor(bot.entity.position.x);
    const startY = Math.floor(bot.entity.position.y);
    const startZ = Math.floor(bot.entity.position.z);

    const points = [
      [startX + 1, startZ],
      [startX + 1, startZ + 1],
      [startX,     startZ + 1],
      [startX - 1, startZ + 1],
      [startX - 1, startZ],
      [startX - 1, startZ - 1],
      [startX,     startZ - 1],
      [startX + 1, startZ - 1],
    ];

    let current = 0;
    bot.pathfinder.setMovements(defaultMove);

    function moveNext() {
      const [x, z] = points[current];
      bot.pathfinder.setGoal(new GoalBlock(x, startY, z));
      current = (current + 1) % points.length;

      // springen
      bot.setControlState('jump', true);
      setTimeout(() => bot.setControlState('jump', false), 300);

      setTimeout(moveNext, 5000);
    }

    moveNext();

    // Anti-AFK (zusätzliches Springen/Sneaken)
    if (config.utils['anti-afk'].enabled) {
      setInterval(() => {
        bot.setControlState('jump', true);
        if (config.utils['anti-afk'].sneak) {
          bot.setControlState('sneak', true);
          setTimeout(() => bot.setControlState('sneak', false), 500);
        }
        setTimeout(() => bot.setControlState('jump', false), 300);
      }, 15000);
    }

    bot.on('goal_reached', () =>
      console.log(`\x1b[32m[AfkBot] Reached target point at ${bot.entity.position}\x1b[0m`)
    );
  });

  bot.on('death', () =>
    console.log(`\x1b[33m[AfkBot] Bot died at ${bot.entity.position}, respawning...\x1b[0m`)
  );

  bot.on('kicked', reason =>
    console.log('\x1b[33m', `[AfkBot] Kicked: ${reason}`, '\x1b[0m')
  );

  bot.on('error', err =>
    console.log(`\x1b[31m[ERROR] ${err.message}\x1b[0m`)
  );

  // Reconnect
  if (config.utils['auto-reconnect']) {
    bot.on('end', () => {
      setTimeout(createBot, config.utils['auto-recconect-delay'] || 5000);
    });
  }
}

createBot();
