const path = require('path');
const express = require("express");
const bodyParser = require('body-parser');
const fileUpload = require('express-fileupload');
const tmp = require('tmp-promise');
const H5P = require('@lumieducation/h5p-server');


const PORT = 3000;

const app = express();


app.use(bodyParser.json({limit: '500mb'}));
app.use(bodyParser.urlencoded({extended: true}));


app.use(fileUpload({
    limits: {fileSize: 500},
    useTempFiles: true,
    tempFileDir: tmp.dirSync({keep: false, unsafeCleanup: true}).name
}));


/**
 * @type {Promise<H5PEditor>}
 */
let H5PEditor;

/**
 *
 * @returns {Promise<H5PEditor>}
 */
async function getHPEditor() {
    if (H5PEditor) {
        return H5PEditor;
    }

    const config = await new H5P.H5PConfig(
        new H5P.fsImplementations.JsonStorage(path.resolve('config/h5p.json'))
    ).load();

    this.HP5Editor = H5P.fs(
        config,
        path.resolve('public/h5p/libraries'),
        path.resolve('public/h5p/temporary-storage'),
        path.resolve('public/h5p/content')
    )
    return this.HP5Editor.setRenderer((model) => model);
}

function user() {
    return {
        id: "10000",
        name: 'Martin Murage',
        type: 'local',
        canCreateRestricted: true,
        canInstallRecommended: true,
        canUpdateAndInstallLibraries: true
    }
}

/**
 *
 * @param editor
 * @returns {H5P.H5PAjaxEndpoint}
 * @constructor
 */
function H5PEndpoint(editor) {
    return new H5P.H5PAjaxEndpoint(editor);
}

app.use(express.static('./public/', {
    cacheControl: true,
    etag: true,
    lastModified: true,
    maxAge: 31536000000
}))

app.get('/h5p-editor', async (req, res) => {

    try {

        const editor = await getHPEditor();
        const model = await editor.render();

        // const metadata = await HP5Editor.getContent('new', {id: 10000, name: 'murage', type:'local' })
        res.send({model})

    } catch (e) {
        console.info(e)
        res.send({error: e})
    }

})

app.get('/h5p-editor/:contentId', async (req, res) => {

    const config = await new H5P.H5PConfig(
        new H5P.fsImplementations.JsonStorage(path.resolve('config/h5p.json'))
    ).load();

    const HP5Editor = H5P.fs(
        config,
        path.resolve('public/h5p/libraries'),
        path.resolve('public/h5p/temporary-storage'),
        path.resolve('public/h5p/content')
    )

    HP5Editor.setRenderer((model) => model);
    const model = await HP5Editor.render()
    const metadata = await HP5Editor.getContent(req.params.contentId,
        {id: 10000, name: 'murage', type: 'local'});

    res.send({model, metadata})
})

app.get('/h5p/ajax', async (req, res) => {

    try {
        const {action} = req.query;
        const {majorVersion, minorVersion, machineName, language} = req.query;
        const editor = await getHPEditor();
        const user1 = user();

        const result = await H5PEndpoint(editor)
            .getAjax(action, machineName, majorVersion, minorVersion, language, user1);


        res.status(200).send(result);


    } catch (e) {
        res.status(400).send({error: e.message});
    }

})

app.post('/h5p/ajax', async (req, res) => {

    try {
        const {action, id, language} = req.query;
        const body = req.body;
        const editor = await getHPEditor();
        const user1 = user();
        const files = req.files && req.files.file ? req.files.file : undefined; // data?: Buffer;mimetype: string;name: string;size: number;tempFilePath?: string;

        const translator = null; //(stringId: string, replacements: )=>string

        const libraryFile = req.files && req.files.h5p ? req.files.h5p : undefined; //library to upload

        console.log('=====>',tmp.dirSync({keep: false, unsafeCleanup: true}));

        const result = await H5PEndpoint(editor)
            .postAjax(action, body, language, user1, files, id, translator, libraryFile);

        res.status(200).send(result);


    } catch (e) {
        console.log(e)
        res.status(400).send({error: e.message});
    }
})


app.post('/h5p/contentUserData', async (req, res) => {

    try {

        const {data, invalidate, preload} = req.body;
        res.status(200).send({});

    } catch (e) {
        res.status(400).send({error: e.message});
    }
})

app.get('**', (req, res) => {

    res.send({status: 'ok'});
})


//temp files cleanup
app.use(((req, res, next) => {
    res.on('finish', async () => {
        if (!req.files) {
            return;
        }

        await Promise.all(
            Object.keys(req.files).map((file) =>
                req.files[file].tempFilePath !== undefined &&
                req.files[file].tempFilePath !== ''
                    ? fsExtra.remove(req.files[file].tempFilePath)
                    : Promise.resolve()
            )
        );
    });

    next();
}))

app.listen(PORT, () => {
    console.log(`up and running at port ${PORT}`)
})
