# bomb desk

a typing battle royale in a dark basement. you and seven other desks type the same lines, and every third slip or the clock running out makes the device on your desk cut one of its six wires. a slip only counts once per letter, so if your fingers keep going after a mistake its still just one slip. five are safe and one isnt, and every safe cut makes the next one worse. the first two rounds go easier, any cut there is half as likely to hit the live wire. whoever finishes a round last gets a cut anyway, last desk still lit wins.

play it at https://ryzee34.github.io/project-bomb-desk/ (needs a keyboard, sounds best with headphones). sit down for a solo game against seven bots, or hit play with friends to open a room and send the link around. the host picks how many bots fill the empty desks, anywhere from none to a full table, and the table card has a light for every desk so everyone can see whos there, warm for players, red for bots and dark for open desks. bots come in five levels, from easy ones that slip constantly up to brutal ones typing around 90 words a minute, and you pick the level before a solo game or the host picks it for the room. put a name in on the table card and everyone sees it on your desk instead of a number.

my first repo back in 2022 was a speed typing test, this is the grown up version.

built with typescript, vite and three.js. every sound is synthesized with web audio so theres no audio files, and the desk is all plain shapes and canvas textures so theres no models either.

## running it

```
npm install
npm run dev
```

rooms need the server running too, in another terminal

```
cd server
npm install
npm run dev
```

the game talks to `ws://127.0.0.1:8787` in dev and to the deployed worker from `.env.production`. `npm run deploy` in `server` ships the worker to cloudflare.

## how its put together

- `src/game` is the rules with no dom in it. a seeded room takes key presses and time and hands back events like slip, roll, cut and out, so a server can run the exact same rules later
- the bots in `src/game/bots.ts` press keys through the same function you do, they just have their own speed and slip rate. each level is a speed and slip range, tuned with a headless sim so a 48 wpm typist wins about 80% on easy, 57% on normal, 20% on hard and almost never on expert or brutal
- `server` is a cloudflare worker with one durable object per room. it runs the same `src/game` rules, owns the lines and the rolls, drives bots for the empty desks and drops keys that come in faster than about 20 a second, so pasting a line in or faking a survive doesnt work. if someone drops a bot covers their desk until they come back
- in a room your own keys are predicted locally with the same rules so typing feels instant, then the servers state corrects it
- `src/scene` is the three.js desk, `src/audio` is the sound and `src/ui` is the strip, hud and room panel
- the lines are 40 i wrote for the game plus 23 public domain ones from poe, shakespeare, conrad, shelley, stoker, stevenson, doyle, dickinson, dickens and melville. i checked them against the project gutenberg text, the only edits are dashes turned into commas and verse joined onto one line
