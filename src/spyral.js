
const levelLimit = 2; // how mutch turns to make

// building size
const size = 3;
// building top left corner map position
const startX = 3;
const startY = 3;

const xMax = 5;
const yMax = 5;

const doStuff = (x, y) => {
    console.log(`(${x},${y})`);
}

let level = 0, x, y, dx, dy;

while (level < levelLimit) {

    console.log(`--level ${level}--`);

    x = -level - 1;
    y = size + level;



    // move right (below)
    dx = 1;
    while (x < size + level) {
        doStuff(startX + x, startY + y);
        x += dx;
    }

    console.log('\n');

    // move up (on left)
    dy = -1;
    while (y >= -level) {
        doStuff(startX + x, startY + y);
        y += dy;
    }

    console.log('\n');

    // move left (on top)
    dx = -1;
    while (x >= -level) {
        doStuff(startX + x, startY + y);
        x += dx;
    }

    console.log('\n');

    // move down (on left)
    dy = 1;
    while (y < size + level) {
        doStuff(startX + x, startY + y);
        y += dy;
    }

    console.log('\n');

    level++;
}
