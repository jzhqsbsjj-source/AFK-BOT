const mineflayer = require('mineflayer');
const Movements = require('mineflayer-pathfinder').Movements;
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const { GoalBlock } = require('mineflayer-pathfinder').goals;

const config = require('./settings.json');
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Bot has arrived');
});

app.listen(8000, () => {
  console.log('Server started');
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

  bot.once('spawn', () => {
    console.log('\x1b[33m[AfkBot] Bot joined the server\x1b[0m');

    // Position merken
    const startX = Math.floor(bot.entity.position.x);
    const startY = Math.floor(bot.entity.position.y);
    const startZ = Math.floor(bot.entity.position.z);

    // Kreisbewegungspunkte (3x3 Fläche)
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

      // Alle 5 Sekunden springen
      bot.setControlState('jump', true);
      setTimeout(() => {
        bot.setControlState('jump', false);
      }, 300);

      setTimeout(moveNext, 5000); // nächste Bewegung nach 5 Sekunden
    }

    moveNext();
  });

  bot.on('kicked', (reason) =>
    console.log('\x1b[33m', `[AfkBot] Kicked: ${reason}`, '\x1b[0m')
  );
  bot.on('error', (err) =>
    console.log(`\x1b[31m[ERROR] ${err.message}\x1b[0m`)
  );
  bot.on('end', () => {
    setTimeout(() => {
      createBot();
    }, config.utils['auto-recconect-delay'] || 5000);
  });
}

createBot();
