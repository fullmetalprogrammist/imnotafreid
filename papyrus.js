#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

// 1. Определяем root (директорию, из которой запустили скрипт)
const rootDir = process.cwd();
const contentDir = path.join(rootDir, 'content');
const pandocStuffDir = path.join(rootDir, 'pandoc stuff');

// 2. Пути к ресурсам Pandoc
const templatePath = path.join(pandocStuffDir, 'fmptemplate.html');
const themePath = path.join(pandocStuffDir, 'fmp.theme');

// 3. Проверка наличия ресурсов
if (!fs.existsSync(templatePath) || !fs.existsSync(themePath)) {
    console.error('Ошибка: не найдены fmptemplate.html или fmp.theme в папке "pandoc stuff".');
    process.exit(1);
}

// 4. Парсинг аргументов вручную
const args = process.argv.slice(2);
let inputPath = null;
let onlyToday = false;
let agoMinutes = null;
let agoDays = null;
let keepName = false;

for (let i = 0; i < args.length; i++) {
    if (args[i] === '-i' || args[i] === '--input') {
        if (i + 1 < args.length) {
            inputPath = args[i + 1];
            i++;
        }
    } else if (args[i] === '--today') {
        onlyToday = true;
    } else if (args[i] === '--ago') {
        if (i + 2 < args.length) {
            const unit = args[i + 1];
            const value = parseInt(args[i + 2], 10);

            if (unit === '-m' && !isNaN(value)) {
                agoMinutes = value;
            } else if (unit === '-d' && !isNaN(value)) {
                agoDays = value;
            }
            i += 2;
        }
    } else if (args[i] === '--keep-name') {
        keepName = true;
    }
}

// Начало сегодняшнего дня в UTC
const today = new Date();
today.setUTCHours(0, 0, 0, 0);

/**
 * Рекурсивный поиск .md файлов (используется для папки content)
 */
function findMdFiles(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        if (entry.name.startsWith('_')) {
            continue;
        }

        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...findMdFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
            files.push(fullPath);
        }
    }
    return files;
}

/**
 * Проверка: изменен ли файл сегодня (с 00:00:00 UTC)
 */
function isModifiedToday(filePath) {
    const stats = fs.statSync(filePath);
    const fileDate = new Date(stats.mtime.getTime() - stats.mtime.getTimezoneOffset() * 60000);
    fileDate.setUTCHours(0, 0, 0, 0);
    return fileDate.getTime() === today.getTime();
}

/**
 * Проверка: изменен ли файл в течение заданного интервала (--ago)
 */
function isModifiedWithin(filePath, minutes, days) {
    const stats = fs.statSync(filePath);
    const fileTime = stats.mtimeMs;
    const now = Date.now();

    let threshold;
    if (minutes !== null) {
        threshold = now - (minutes * 60 * 1000);
    } else if (days !== null) {
        threshold = now - (days * 24 * 60 * 60 * 1000);
    } else {
        return false;
    }

    return fileTime >= threshold;
}

/**
 * Разбирает входной путь -i. 
 * Возвращает массив всех .md файлов внутри (рекурсию в папки внутри -i не делаем, только верхний уровень).
 */
function resolveInputPath(inputPath) {
    const stats = fs.statSync(inputPath);

    if (stats.isFile()) {
        if (!inputPath.endsWith('.md')) {
            console.error('Ошибка: указанный файл не имеет расширения .md');
            process.exit(1);
        }
        return [inputPath];
    }

    if (stats.isDirectory()) {
        const entries = fs.readdirSync(inputPath, { withFileTypes: true });
        const mdFiles = [];

        for (const entry of entries) {
            if (entry.isFile() && entry.name.endsWith('.md')) {
                mdFiles.push(path.join(inputPath, entry.name));
            }
        }

        if (mdFiles.length === 0) {
            console.error(`Ошибка: в указанной директории (${inputPath}) не найдено .md файлов.`);
            process.exit(1);
        }

        return mdFiles;
    }

    console.error('Ошибка: не удалось определить тип пути (не файл и не папка).');
    process.exit(1);
}

/**
 * Запускает Pandoc для одного файла
 */
function convertFile(sourcePath, useKeepNameLogic) {
    let outputFileName;
    
    if (useKeepNameLogic) {
        const baseName = path.basename(sourcePath, '.md');
        outputFileName = baseName + '.html';
    } else {
        outputFileName = 'index.html';
    }

    const outputPath = path.join(path.dirname(sourcePath), outputFileName);
    
    const args = [
        sourcePath,
        '-o', outputPath,
        `--template=${templatePath}`,
        `--syntax-highlighting=${themePath}`
    ];

    console.log(`Конвертирую: ${path.relative(rootDir, sourcePath)} -> ${path.relative(rootDir, outputPath)}`);

    execFile('pandoc', args, (error, stdout, stderr) => {
        if (error) {
            console.error(`Ошибка при конвертации ${sourcePath}: ${stderr || error.message}`);
            return;
        }
        if (stderr) {
            console.warn(`Предупреждение от Pandoc: ${stderr}`);
        }
    });
}

// 5. Логика выбора файлов
let filesToProcess = [];

if (inputPath) {
    // Режим: работа с конкретным путем через -i
    filesToProcess = resolveInputPath(inputPath);

    // Определяем логику именования:
    // Если файлов больше одного -> принудительно сохраняем имена (useKeepNameLogic = true)
    // Если файл один -> смотрим на флаг --keep-name
    const useKeepNameLogic = (filesToProcess.length > 1) || (filesToProcess.length === 1 && keepName);
    
    // Запускаем конвертацию с выбранной логикой
    filesToProcess.forEach(file => convertFile(file, useKeepNameLogic));
    
} else {
    // Режим: работа с папкой content (поддерживает --today и --ago)
    if (!fs.existsSync(contentDir)) {
        console.error(`Папка content не найдена в ${rootDir}`);
        process.exit(1);
    }
    filesToProcess = findMdFiles(contentDir);

    if (agoMinutes !== null || agoDays !== null) {
        filesToProcess = filesToProcess.filter(file => isModifiedWithin(file, agoMinutes, agoDays));
    } else if (onlyToday) {
        filesToProcess = filesToProcess.filter(isModifiedToday);
    }

    if (filesToProcess.length === 0) {
        if (agoMinutes !== null || agoDays !== null) {
            const unit = agoMinutes !== null ? 'минут' : 'дней';
            const value = agoMinutes !== null ? agoMinutes : agoDays;
            console.log(`Файлы, измененные за последние ${value} ${unit}, не найдены.`);
        } else if (onlyToday) {
            console.log('Файлы, модифицированные сегодня, не найдены.');
        } else {
            console.log('Файлы .md для обработки не найдены.');
        }
        process.exit(0);
    }

    // В режиме content всегда используем логику флага --keep-name
    filesToProcess.forEach(file => convertFile(file, keepName));
}