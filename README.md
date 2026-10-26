# bomb desk

a typing battle royale in a dark basement. you and seven other desks type the same lines, and every third slip or the clock running out makes the device on your desk cut one of its six wires. five are safe and one isnt, and every safe cut makes the next one worse. whoever finishes a round last gets a cut anyway, last desk still lit wins.

play it at https://ryzee34.github.io/project-bomb-desk/ (needs a keyboard, sounds best with headphones)

my first repo back in 2022 was a speed typing test, this is the grown up version.

built with typescript, vite and three.js. every sound is synthesized with web audio so theres no audio files, and the desk is all plain shapes and canvas textures so theres no models either.

## running it

```
npm install
npm run dev
```

## how its put together

- `src/game` is the rules with no dom in it. a seeded room takes key presses and time and hands back events like slip, roll, cut and out, so a server can run the exact same rules later
- the bots in `src/game/bots.ts` press keys through the same function you do, they just have their own speed and slip rate
- `src/scene` is the three.js desk, `src/audio` is the sound and `src/ui` is the strip, hud and room panel
- the lines are 40 i wrote for the game plus 23 public domain ones from poe, shakespeare, conrad, shelley, stoker, stevenson, doyle, dickinson, dickens and melville. i checked them against the project gutenberg text, the only edits are dashes turned into commas and verse joined onto one line
