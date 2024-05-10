/** Pokemon Info server */

const express = require("express"); /* Accessing express module */
const app = express(); /* app is a request handler function */
const path = require("path");
const publicPath = __dirname;
app.use(express.static(publicPath));
const bodyParser = require("body-parser"); /* To handle post parameters */
//add in mongoDB things
require("dotenv").config({ path: path.resolve(__dirname, '.env') }) 

const uri = process.env.MONGO_CONNECTION_STRING;

/* Our database and collection */
//const databaseAndCollection = {db: "CMSC335_DB", collection:"pokemonParty"};
const databaseAndCollection = {db: process.env.MONGO_DB_NAME, collection: process.env.MONGO_COLLECTION};
const { MongoClient, ServerApiVersion } = require('mongodb');
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

/* Initializes request.body with post information */ 
app.use(bodyParser.urlencoded({ extended: false }));
app.set("views", path.resolve(__dirname, "templates"));
app.set("view engine", "ejs");

/* Important */
process.stdin.setEncoding("utf8");

// checking the length of the arguments given
/*if (process.argv.length != 3) {
  process.stdout.write(`Usage pokemonServer.js PortNumber`);
  process.exit(1);
}*/

// get the port number from what was entered
//const portNumber = process.argv[2];
const portNumber = process.env.PORT || 5000;

//start the server
app.listen(portNumber);
//console.log(`Server started on port ${portNumber}`);
console.log(`Web server started and running at http://localhost:${portNumber}`);

// then we can prompt
const prompt = "Stop to shutdown the server: ";
process.stdout.write(prompt);
process.stdin.on("readable", function () {
  const dataInput = process.stdin.read();
  if (dataInput !== null) {
    const command = dataInput.trim();
    if (command === "stop") {
        console.log("Shutting down the server");
        process.exit(0);  /* exiting */
    } else {
        /* After invalid command, we cannot type anything else */
        console.log(`Invalid command: ${command}`);
    }
    process.stdout.write(prompt);
    process.stdin.resume();
  }
});

/**This endpoint renders the main page of the application and it will display the contents of the index.ejs template file. 
 * This is the home page that allows the user to search up a pokemon by its name or id number
 * and then they can click submit to get the info.
*/
app.get("/", (request, response) => {
    response.render("index", {port: portNumber});
});

/**This endpoint looks up the pokemon from the API if it is not already in the database
 * If it is already in the database we pull the info from it. If it is not already in the database 
 * then we make a call to the pokemon API to get its information.
 * We then send that info over to get rendered.
*/
app.post("/", async (request, response) => {
    console.log("inside the post method of index - for searching up pokemon");
    // get the pokemon name or id from the body
    let pokemonNameOrId =  request.body.pokemonName;

    console.log(pokemonNameOrId);
    //check if pokemon in database already - then no need to do an API call
    let pokemon = await lookupPokemon(pokemonNameOrId);
    let found, name, id, types, abilities, height, weight, image, shiny;
    console.log(pokemon)
    if (pokemon !== null){
        console.log("pokemon already in database. Retrieving information");
        found = true;
        name = pokemon.name;
        id = pokemon.pokeId;
        types = pokemon.types;
        abilities = pokemon.abilities;
        height = pokemon.height;
        weight = pokemon.weight;
        image = pokemon.image;
        shiny = pokemon.shiny;

        //add to database for search history purposes
        insertPokemon(name, id, types, abilities, height, weight, image, shiny);
    } else { 
        //if not then lets do a call to the api
        console.log("pokemon not in database. Doing an API call");
        ({found, name, id, types, abilities, height, weight, image, shiny} = await getPokemonInfo(pokemonNameOrId.toLowerCase()));
        if (found){
            insertPokemon(name, id, types, abilities, height, weight, image, shiny);
        } 
    }

    // format the abilities and types into lists
    let abilitiesList = "<ul>"
    abilities.forEach(i => abilitiesList += `<li>${i}</li>`)
    abilitiesList += "</ul>"

    let typesList = "<ul>"
    types.forEach(i => typesList += `<li>${i}</li>`)
    typesList += "</ul>"

    // send back variable to get rendered
    const variables = { name: name, id: id, type: typesList, abilities: abilitiesList, 
        height: height, weight: weight, pokeImage: image, shiny: shiny};
    response.render("pokemonInfo", variables);

}); 

/**This endpoint displays the previously searched pokemon */
app.get("/prevPokemon", async (request, response) => {
    let pokemonList = await listAllPokemon();
    let pokemonTable;

    if (pokemonList.length == 0){
        pokemonTable = "No Previous Pokemon Searches<br>"
    } else {
        // if we have previous searches in database then put them into a table format
        pokemonTable = "<table border='1'><tr><th>Id</th><th>Name</th><th>Image</th></tr>"
        pokemonList.forEach(pokemon => pokemonTable += 
            `<tr><td>${pokemon.pokeId}</td><td>${pokemon.name}</td><td><img src="${pokemon.image}" alt="Pokemon Image"></td></tr>`)
        pokemonTable += `</table>`
    }
    // send back variables to get rendered on page
    const variables = { pokemonTable: pokemonTable, port: portNumber};
    response.render("allPokemon", variables);
});

/**This endpoint deletes the database entries and then displays the number deleted. */
app.post("/clearHistory", async (request, response) => {
    let numRemoved = await clearDatabase();
    console.log("Deleted " + numRemoved + " pokemon");
    const variables = {numRemoved: numRemoved};
    response.render("pokemonRemoval", variables);
});


/**Used to insert a pokemon */
async function insertPokemon(name, id, types, abilities, height, weight, image, shiny){
    try {
        await client.connect();
       
        /* Inserting one pokemon */
        console.log("***** Inserting one pokemon *****");
        let pokemon = {name: name, pokeId: id, types: types, abilities: abilities, height: height, weight: weight, image: image, shiny: shiny};
        const result = await client.db(databaseAndCollection.db).collection(databaseAndCollection.collection).insertOne(pokemon);
        console.log(`Applicant entry created with id ${result.insertedId}`);

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

/*Used to Lookup a pokemon by its name or id*/
async function lookupPokemon(nameOrId) {
    let result;
    let name = false;
    if (isNaN(nameOrId)){
        console.log("this is a name")
        name = true
    }
    try {
        await client.connect();
        let filter;
        if (name){
            filter = {name: nameOrId};
        } else {
            console.log("this is a number")
            filter = {pokeId: Number(nameOrId)};
        }
        result = await client.db(databaseAndCollection.db)
                            .collection(databaseAndCollection.collection)
                            .findOne(filter);
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
        return result;
    }
}


/**Used to clear the database */
async function clearDatabase(){
    let result;
    try {
        await client.connect();
        console.log("***** Clearing Collection *****");
        result = await client.db(databaseAndCollection.db)
        .collection(databaseAndCollection.collection)
        .deleteMany({});
        //console.log(`Deleted documents ${result.deletedCount}`);
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
        return result.deletedCount;
    }
}

/**Used to list all pokemon in the database */
async function listAllPokemon(){
    let result;
    try {
        await client.connect();
        let filter = {};
        const cursor = client.db(databaseAndCollection.db)
        .collection(databaseAndCollection.collection)
        .find(filter);
        
        result = await cursor.toArray();
        //console.log(`Found: ${result.length} pokemon`);
        //console.log(result);
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
        return result;
    }
}

/**Used to get the pokemon's info from the pokemon API */
async function getPokemonInfo(pokemonName){
    let url = "https://pokeapi.co/api/v2/pokemon/" + pokemonName + "/";
    const result = await fetch(url);

    if (result.status == 404){
        return {found:false, 
            name:"Invalid pokemon name. Here are some photos of cubchoo instead :)", 
            id:"NONE", types:["NONE"], abilities:["NONE"], height:"NONE", weight:"NONE", 
            image:"https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/613.png", 
            shiny:"https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/613.png"};
    }

    const json = await result.json();
        

    //name, type, abilities, sprites
    //let abilities = json.abilities; // abilities.ability.name , i.ability.name
    let name = json.name;
    let id = json.id;
    let abilities = []
    json.abilities.forEach(i => abilities.push(i.ability.name));
    let height = json.height / 10; // get kg weight
    let weight = json.weight / 10; // get meter height
    let image = json.sprites.front_default; // get the url for the images
    let shiny = json.sprites.front_shiny; // get the url for the shiny image
    let types = []
    json.types.forEach(i => types.push(i.type.name)); // types.type.name , i.type.name

    console.log(types);
    console.log(abilities);
    console.log(height);
    console.log(weight);
    console.log(image);
    console.log(shiny);

    //console.log(json);

    return {found: true, name, id, types, abilities, height, weight, image, shiny};
}
