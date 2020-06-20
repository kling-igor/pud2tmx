import * as fs from 'fs';
import * as path from 'path';

import * as readline from 'readline';
import * as stream from 'stream';

import {
  unitTypes,
  upgradeTypes,
  objectLayersData,
  forestTranscode,
  winterTranscode,
  wastelandTranscode,
  swampTranscode,
  movementTranscodeTable,
  actionTranscodeTable,
} from './tables';

const args = process.argv.slice(2);

if (args.length === 0) {
  throw new Error('input file should be specified');
}

const sourceFile = args[0];
const mapFile = sourceFile.match(/(\w*)\.txt/)[1];

const inStream = fs.createReadStream(`${__dirname}/${sourceFile}`);
const rl = readline.createInterface(inStream);

const tilesMapSource = [];

const movementMapSource = [];

const actionMapSource = [];

let mapDimension;
let era;
let transcodeTable;
let tilesetName;
let mapUnitsCount = 0;

const mapUnits = [];
let currentMapUnit;

const unitDescriptions = {};
let currentUnitDescription;

const upgradesDescription = {};
let currentUpgradeDescription;

const parsers = [rootParser];

rl.on('line', (line) => {
  const parser = parsers[parsers.length - 1] || rootParser;
  parser(line);
});

rl.on('close', () => {
  exportTMXMap(`${mapFile}.tmx`);
});

// http://cade.datamax.bg/war2x/pudspec.html

function rootParser(line) {
  if (line.match(/^Tiles Map/)) {
    parsers.push(tilesMapParser);
  } else if (line.match(/^Action Map/)) {
    parsers.push(actionMapParser);
  } else if (line.match(/^Movement Map/)) {
    parsers.push(movementMapParser);
  } else if (line.match(/^Era/)) {
    const eraMatch = line.match(/^Era\.*:\s(\w*)/);
    if (eraMatch) {
      era = eraMatch[1];

      switch (era) {
        case 'Forest':
          transcodeTable = forestTranscode;
          tilesetName = 'forest_tileset.tsx';
          break;
        case 'Winter':
          transcodeTable = winterTranscode;
          tilesetName = 'winter_tileset.tsx';
          break;
        case 'Wasteland':
          transcodeTable = wastelandTranscode;
          tilesetName = 'wasteland_tileset.tsx';
          break;
        case 'Swamp':
          transcodeTable = swampTranscode;
          tilesetName = 'swamp_tileset.tsx';
          break;
      }
    }
  } else if (line.match(/^Dimensions/)) {
    const dimensionsMatch = line.match(/^Dimensions\.*:\s(\d{2,3})\sx\s(\d{2,3})/);
    if (dimensionsMatch) {
      mapDimension = { width: dimensionsMatch[1], height: dimensionsMatch[2] };
    }
  } else if (line.match(/^Units/)) {
    const unitsMatch = line.match(/^Units\.*:\s(\d*)/);
    if (unitsMatch) {
      mapUnitsCount = unitsMatch[1];
      parsers.push(mapUnitsSectionParser);
    }
  } else if (line.match(/^Upgrades\.*:/)) {
    parsers.push(upgradeSectionParser);
  } else if (line.match(/^Unit Data/)) {
    parsers.push(unitsDataSectionParser);
  }
}
/**
 * Парсер секции данных о тайлах карты
 * */
function tilesMapParser(line) {
  if (line.match(/^0x[0-9A-F]{4}/i)) {
    const data = line.split(' ', mapDimension.width).map((value) => {
      return parseInt(transcodeTable.get(value), 10);
    });

    const string = data.join(', ');

    tilesMapSource.push(string);
  } else {
    parsers.pop();
    const parser = parsers[parsers.length - 1] || rootParser;
    parser(line);
  }
}

function movementMapParser(line) {
  if (line.match(/^0x[0-9A-F]{4}/i)) {
    const data = line.split(' ', mapDimension.width).map((value) => {
      for (let i = 0; i < movementTranscodeTable.length; i++) {
        const regex = movementTranscodeTable[i];
        if (value.match(regex)) {
          return i + 404;
        }
      }

      return 404 + 11;
    });

    const string = data.join(', ');

    movementMapSource.push(string);
  } else {
    parsers.pop();
    const parser = parsers[parsers.length - 1] || rootParser;
    parser(line);
  }
}

function actionMapParser(line) {
  if (line.match(/^0x[0-9A-F]{4}/i)) {
    const data = line.split(' ', mapDimension.width).map((value) => {
      const retVal = actionTranscodeTable[value];
      if (!retVal) {
        return 404 + 7;
      }
      return 404 + retVal;
    });

    const string = data.join(', ');

    actionMapSource.push(string);
  } else {
    parsers.pop();
    const parser = parsers[parsers.length - 1] || rootParser;
    parser(line);
  }
}

/**
 * Парсер секции юнитов на карте
 * */
function mapUnitsSectionParser(line) {
  if (line.match(/\s*Unit\s\d{4}/)) {
    currentMapUnit = {};
    parsers.push(unitDescriptionParser);
  } else {
    parsers.pop();
    const parser = parsers[parsers.length - 1] || rootParser;
    parser(line);
  }
}
/**
 * Парсер секции детального описания юнита на карте
 *
 *   Unit 0003.........:
 *     X,Y............: 17,7
 *     Type...........: Footman (0x0)
 *     Owner..........: 0x1
 *     Alter..........: 1
 * */
function unitDescriptionParser(line) {
  if (line.match(/\s*X,Y/)) {
    const positionMatch = line.match(/\s*X,Y\.*:\s(\d{1,3}),(\d{1,3})/);
    if (positionMatch) {
      // TODO: нужно координаты умножить на 32
      currentMapUnit.position = { x: positionMatch[1], y: positionMatch[2] };
    }
  } else if (line.match(/\s*Type/)) {
    const typeMatch = line.match(/\s*Type\.*:\s(\w*(?:\s\w*)*)\s\(0x([0-9a-f]*)/);
    if (typeMatch) {
      // currentMapUnit.type = typeMatch[1];
      currentMapUnit.type = typeMatch[2];
    }
  } else if (line.match(/\s*Owner/)) {
    const ownerMatch = line.match(/\s*Owner\.*:\s0x([0-9a-f]*)/);
    if (ownerMatch) {
      currentMapUnit.owner = parseInt(ownerMatch[1], 16);
    }
  } else if (line.match(/\s*Alter/)) {
    // do nothing
    // 0 - passive
    // 1 - active
    // this * 2500 - запасы рудника или нефти
  } else {
    if (currentMapUnit.position && currentMapUnit.type && currentMapUnit.owner) {
      mapUnits.push(currentMapUnit);
    }

    parsers.pop();
    const parser = parsers[parsers.length - 1] || rootParser;
    parser(line);
  }
}

function upgradeSectionParser(line) {
  const upgradesMatch = line.match(/\s*upgrades\s0x([0-9,a-f]*)/);
  if (upgradesMatch) {
    currentUpgradeDescription = {};
    upgradesDescription[upgradeTypes[upgradesMatch[1]]] = currentUpgradeDescription;
    parsers.push(upgradeDetailsSectionParser);
  } else {
    parsers.pop();
    const parser = parsers[parsers.length - 1] || rootParser;
    parser(line);
  }
}

function upgradeDetailsSectionParser(line) {
  const timeMatch = line.match(/Time\.*:\s(\d*)/);
  const goldMatch = line.match(/Gold\.*:\s(\d*)/);
  const lumberMatch = line.match(/Lumber\.*:\s(\d*)/);
  const oilMatch = line.match(/Oil\.*:\s(\d*)/);
  const groupMatch = line.match(/Group\.*:\s0x(?:0?)([0-9,a-f]*)/);
  const flagsMatch = line.match(/Flags\.*:\s(\d*)/);

  if (timeMatch) {
    currentUpgradeDescription['time'] = parseInt(timeMatch[1]);
  } else if (goldMatch) {
    currentUpgradeDescription['gold'] = parseInt(goldMatch[1]);
  } else if (lumberMatch) {
    currentUpgradeDescription['lumber'] = parseInt(lumberMatch[1]);
  } else if (oilMatch) {
    currentUpgradeDescription['oil'] = parseInt(oilMatch[1]);
  } else if (groupMatch) {
    // currentUpgradeDescription['group'] = parseInt(groupMatch[1], 16);
  } else if (flagsMatch) {
    currentUpgradeDescription['flags'] = /*flagsMatch[1];//*/ parseInt(flagsMatch[1], 2);
    parsers.pop();
  }
}

// парсер харакетристик сущностей
function unitsDataSectionParser(line) {
  const unitMatch = line.match(/\s*Unit\s0x(?:0?)([0-9,a-f]*)/);
  if (unitMatch) {
    const record = unitTypes.get(unitMatch[1]);
    if (record) {
      const type = record.symbol;
      unitDescriptions[type] = {};
      currentUnitDescription = unitDescriptions[type];
    } else {
      currentUnitDescription = {}; // fake
    }

    parsers.push(unitDataDetailsParser);
  } else {
    parsers.pop();
    const parser = parsers[parsers.length - 1] || rootParser;
    parser(line);
  }
}

function unitDataDetailsParser(line) {
  const overlapMatch = line.match(/Overlap\.*:\s(\d*)/);
  const sightMatch = line.match(/Sight\.*:\s(\d*)/);
  const hitPointsMatch = line.match(/Hit\sPoints\.*:\s(\d*)/);
  const buildTimeMatch = line.match(/Build\sTime\.*:\s(\d*)/);
  const goldCostMatch = line.match(/Gold\sCost\.*:\s(\d*)/);
  const lumberCostMatch = line.match(/Lumber\sCost\.*:\s(\d*)/);
  const oilCostMatch = line.match(/Oil\sCost\.*:\s(\d*)/);
  const widthMatch = line.match(/^\s*Width\.*:\s(\d*)/);
  const heightMatch = line.match(/^\s*Height\.*:\s(\d*)/);
  const boxWidthMatch = line.match(/Box\sWidth\.*:\s(\d*)/);
  const boxHeightMatch = line.match(/Box\sHeight\.*:\s(\d*)/);
  const rangeMatch = line.match(/Range\.*:\s(\d*)/);
  const computerReactRangeMatch = line.match(/Cptr\sreact\srg\.*:\s(\d*)/);
  const humanReactRangeMatch = line.match(/Hmn\sreac\srg\.*:\s(\d*)/);
  const armorMatch = line.match(/Armor\.*:\s(\d*)/);
  const priorityMatch = line.match(/Priority\.*:\s(\d*)/);
  const basicDamageMatch = line.match(/Basic\sDmg\.*:\s(\d*)/);
  const piercingDamageMatch = line.match(/Piercing\sDmg\.*:\s(\d*)/);
  const missileMatch = line.match(/Missile\.*:\s(\d*)/);
  const typeMatch = line.match(/Type\.*:\s(\d*)/);
  const decayRateMatch = line.match(/Decay\sRate\.*:\s(\d*)/);
  const annoyMatch = line.match(/Annoy\.*:\s(\d*)/);
  const mouse2ButtonMatch = line.match(/Mouse\s2\sBtn\.*:\s(\d*)/);
  const pointValueMatch = line.match(/Point\sValue\.*:\s(\d*)/);
  const canTargetMatch = line.match(/Can\sTarget\.*:\s(\d*)/);
  const rectSelMatch = line.match(/Rect\sSel\.*:\s(\d*)/);
  const hasMagicMatch = line.match(/Has\sMagic\.*:\s(\d*)/);
  const weaponsUpgradeMatch = line.match(/Weapons\sUgrd\.*:\s(\d*)/);
  const armorUpgradeMatch = line.match(/Armor\sUgrd\.*:\s(\d*)/);
  const flagsMatch = line.match(/Flags\.*:\s(\d*)/);

  if (overlapMatch) {
    currentUnitDescription['overlap'] = parseInt(overlapMatch[1]);
  } else if (sightMatch) {
    currentUnitDescription['sightRange'] = parseInt(sightMatch[1]);
  } else if (hitPointsMatch) {
    currentUnitDescription['hitPoints'] = parseInt(hitPointsMatch[1]);
  } else if (buildTimeMatch) {
    currentUnitDescription['buildTime'] = parseInt(buildTimeMatch[1]);
  } else if (goldCostMatch) {
    currentUnitDescription['goldCost'] = parseInt(goldCostMatch[1]) * 10;
  } else if (lumberCostMatch) {
    currentUnitDescription['lumberCost'] = parseInt(lumberCostMatch[1]) * 10;
  } else if (oilCostMatch) {
    currentUnitDescription['oilCost'] = parseInt(oilCostMatch[1]) * 10;
  } else if (widthMatch) {
    currentUnitDescription['width'] = parseInt(widthMatch[1]);
  } else if (heightMatch) {
    currentUnitDescription['height'] = parseInt(heightMatch[1]);
  } else if (boxWidthMatch) {
    currentUnitDescription['boxWidth'] = parseInt(boxWidthMatch[1]);
  } else if (boxHeightMatch) {
    currentUnitDescription['boxHeight'] = parseInt(boxHeightMatch[1]);
  } else if (rangeMatch) {
    currentUnitDescription['attackRange'] = parseInt(rangeMatch[1]);
  } else if (computerReactRangeMatch) {
    currentUnitDescription['computerReactRange'] = parseInt(computerReactRangeMatch[1]);
  } else if (humanReactRangeMatch) {
    currentUnitDescription['humanReactRange'] = parseInt(humanReactRangeMatch[1]);
  } else if (armorMatch) {
    currentUnitDescription['armor'] = parseInt(armorMatch[1]);
  } else if (priorityMatch) {
    currentUnitDescription['priority'] = parseInt(priorityMatch[1]);
  } else if (basicDamageMatch) {
    currentUnitDescription['basicDamage'] = parseInt(basicDamageMatch[1]);
  } else if (piercingDamageMatch) {
    currentUnitDescription['piercingDamage'] = parseInt(piercingDamageMatch[1]);
  } else if (missileMatch) {
    currentUnitDescription['missile'] = parseInt(missileMatch[1]);
  } else if (typeMatch) {
    currentUnitDescription['type'] = parseInt(typeMatch[1]);
  } else if (decayRateMatch) {
    currentUnitDescription['decayRate'] = parseInt(decayRateMatch[1]);
  } else if (annoyMatch) {
    currentUnitDescription['annoyFactor'] = parseInt(annoyMatch[1]);
  } else if (mouse2ButtonMatch) {
    currentUnitDescription['mouse2ndButtonBehavior'] = parseInt(mouse2ButtonMatch[1]);
  } else if (pointValueMatch) {
    currentUnitDescription['points'] = parseInt(pointValueMatch[1]);
  } else if (canTargetMatch) {
    currentUnitDescription['canTarget'] = canTargetMatch[1] === '1';
  } else if (rectSelMatch) {
    currentUnitDescription['rectangleSelectable'] = rectSelMatch[1] === '1';
  } else if (hasMagicMatch) {
    currentUnitDescription['hasMagic'] = hasMagicMatch[1] === '1';
  } else if (weaponsUpgradeMatch) {
    currentUnitDescription['weaponsUpgradable'] = weaponsUpgradeMatch[1] === '1';
  } else if (armorUpgradeMatch) {
    currentUnitDescription['armorUpgradable'] = armorUpgradeMatch[1] === '1';
  } else if (flagsMatch) {
    currentUnitDescription['flags'] = parseInt(flagsMatch[1], 2);
    parsers.pop();
  }
  // else {
  //     parsers.pop();
  //     const parser = parsers[parsers.length - 1] || rootParser;
  //     parser(line);
  // }
}

function exportTMXMap(fileName) {
  // строка предстявляющая собой все объектные слои
  let objectLayers = '';

  // тут сохраняем готовые строки объектов для каждого из слоев
  const layerObjects = [
    [], // 1
    [], // 2
    [], // 3
    [], // 4
    [], // 5
    [], // 6
    [], // 7
    [], // 8
    [], // neutral
  ];

  let id = 0;

  // проходим по всем юнитам
  for (const unit of mapUnits) {
    if (!unitTypes.has(unit.type)) {
      console.log(`NO DATA FOR ${unit.type} in unitTypes ${unit}`);
      for (const key in unit) {
        console.log(`${key} = ${unit.key}`);
      }
      continue;
    }

    const {
      name,
      size: { w, h },
    } = unitTypes.get(unit.type);

    const type = unitTypes.get(unit.type).symbol;

    const object = `    <object id="${id}" name="${name}" type="${type}" x="${unit.position.x * 32}" y="${unit.position.y * 32}" width="${w * 32}" height="${
      h * 32
    }"></object>`;

    if (unit.owner > 7) {
      layerObjects[8].push(object);
    } else {
      layerObjects[unit.owner].push(object);
    }

    id++;
  }

  // собираем слои объектов
  for (let i = 8; i >= 0; i--) {
    const layer = layerObjects[i];
    const layerTemplate =
      layer.length > 0
        ? `  <objectgroup color="${objectLayersData[i].color}" name="${objectLayersData[i].name}">
      <properties>
      <property name="agent" value="user"/>
      <property name="allowSpells" value="11111111111111111111111111111111"/>
      <property name="allowUnits" value= "11111111111111111111111111111111"/>
      <property name="allowUpgrades" value="11111111111111111111111111111111"/>
      <property name="gold" type="int" value="5000"/>
      <property name="lumber" type="int" value="5000"/>
      <property name="oil" type="int" value="5000"/>
      <property name="race" value="human"/>
      </properties>
      ${layer.join('\n ')}
    </objectgroup>
`
        : `  <objectgroup color="${objectLayersData[i].color}" name="${objectLayersData[i].name}" visible="0"/>`;

    objectLayers += `${layerTemplate}\n`;
  }

  const template = `<?xml version="1.0" encoding="UTF-8"?>
  <map version="1.0" tiledversion="1.0.2" orientation="orthogonal" renderorder="right-down" width="${mapDimension.width}" height="${
    mapDimension.height
  }" tilewidth="32" tileheight="32" nextobjectid="1">
    <properties>
      <property name="era" value="${era.toLowerCase()}"/>
    </properties>
  <tileset firstgid="1" source="${tilesetName}"/>
  <tileset firstgid="404" source="colors_tileset.tsx"/>
  <layer name="Tile Layer" width="${mapDimension.width}" height="${mapDimension.height}">
    <data encoding="csv">
${tilesMapSource.join(', \n')}
    </data>
  </layer>
  <layer name="Action Layer" width="${mapDimension.width}" height="${mapDimension.height}" opacity="0.5" visible="0">
    <data encoding="csv">
${actionMapSource.join(', \n')}
    </data>
  </layer>
  <layer name="Movement Layer" width="${mapDimension.width}" height="${mapDimension.height}" opacity="0.5" visible="0">
    <data encoding="csv">
${movementMapSource.join(', \n')}
    </data>
  </layer>
${objectLayers}
</map>
`;

  fs.writeFile(`${__dirname}/${fileName}`, template, (err) => {
    if (err) {
      return console.log(err);
    }

    console.log(`The file '${fileName}' was saved!`);
  });

  // console.log(JSON.stringify(unitDescriptions));

  //console.log(JSON.stringify(upgradesDescription));
}
