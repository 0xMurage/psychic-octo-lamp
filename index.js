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
    useTempFiles: true,
    tempFileDir: tmp.dirSync({keep: false, unsafeCleanup: true}).name
}));


/**
 * @type {Promise<H5PEditor>}
 */
let H5PEditor;

/**
 * @type {Promise<H5PPlayer>}
 */
let H5PPlayer;

async function loadH5PConfig() {
    return await new H5P.H5PConfig(
        new H5P.fsImplementations.JsonStorage(path.resolve('config/h5p.json'))
    ).load()
}

const H5PLocalPath = {
    libraries: path.resolve('public/h5p/libraries'),
``    temporary: path.resolve('public/h5p/temporary-storage'),
    content: path.resolve('public/h5p/content')
}

/**
 *
 * @returns {Promise<H5PEditor>}
 */
async function getHPEditor() {
    if (H5PEditor) {
        return H5PEditor;
    }

    const config = await loadH5PConfig();

    this.HP5Editor = H5P.fs(
        config,
        H5PLocalPath.libraries,
        H5PLocalPath.temporary,
        H5PLocalPath.content
    )
    return this.HP5Editor.setRenderer((model) => model);
}

/**
 *
 * @returns {Promise<H5PPlayer>}
 */
async function getHPPlayer() {
    if (H5PPlayer) {
        return H5PPlayer;
    }

    const config = await loadH5PConfig();

    return new H5P.H5PPlayer(
        new H5P.fsImplementations.FileLibraryStorage(H5PLocalPath.libraries),
        new H5P.fsImplementations.FileContentStorage(H5PLocalPath.content),
        config
    )
}

function user() {
    return {
        id: "10000",
        name: 'Martin Murage',
        type: 'local',
        canCreateRestricted: false,
        canInstallRecommended: false,
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

app.get('/h5p-editor/:contentId', async (req, res) => {

    try {

        const contentId = req.params.contentId;
        const editor = await getHPEditor();
        const model = await editor.render(contentId);
        const content = await editor.getContent(contentId, user());

        //
        res.send({model: {...model, metadata: content.h5p, library: content.library, params: content.params}})

    } catch (e) {
        console.info(e)
        res.send({error: e})
    }
})


app.get('/h5p-editor', async (req, res) => {

    try {

        const editor = await getHPEditor();
        const model = await editor.render();

        res.send({model})

    } catch (e) {
        console.info(e)
        res.send({error: e})
    }

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
        const files = req.files && req.files.file ? req.files.file : undefined;
        const translator = null; //(stringId: string, replacements: )=>string

        const libraryFile = req.files && req.files.h5p ? req.files.h5p : undefined; //library to upload

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
});


app.post('/h5p/new', async (req, res) => {

    try {

        if (!req.body.params || !req.body.params.params ||
            !req.body.params.metadata || !req.body.library) {
            res.status(400).send('Malformed request');
            return
        }

        const body = req.body;
        const editor = await getHPEditor();
        const user1 = user();


        const result = await editor.saveOrUpdateContentReturnMetaData(
            body.contentId || undefined,
            body.params.params,
            body.params.metadata,
            body.library,
            user1
        );


        res.status(200).send(result);

    } catch (e) {
        res.status(400).send({error: e.message});
    }
});


app.get('/h5p-player/:contentId', async (req, res) => {

    try {
        const contentId = req.params.contentId;

        const player = await getHPPlayer();

        player.setRenderer((model => model));

        const results = await player.render(contentId)

        res.send({model: results})
    } catch (e) {
        console.log(e);
        res.status(400).send({error: e.message});

    }
})

app.get('/h5p/content/:contentId', async (req, res) => {

    try {

        const contentId = req.params.contentId;
        const user1 = user();

        const editor = await getHPEditor();

        const {title, language, license} = await editor.contentManager.getContentMetadata(contentId, user1);

        res.send({contentId, title, language, license})

    } catch (e) {
        console.info(e)
        res.send({error: e})
    }

})

app.get('/h5p/content', async (req, res) => {

    try {

        const user1 = user();

        const editor = await getHPEditor();
        const contendIds = await editor.contentManager.listContent(user1);
        const data = await Promise.all(contendIds.map(async (id) => {
            const {title, language, license} = await editor.contentManager.getContentMetadata(id, user1);

            return {id, title, language, license};
        }))
        res.send({data})

    } catch (e) {
        console.info(e)
        res.send({error: e})
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
