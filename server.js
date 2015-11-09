var connect = require('connect'),
    app = connect(),
    http = require('http'),
    server = http.createServer(app),
    urlrouter = require('urlrouter'),
    io = require('socket.io').listen(server),
    fs = require('fs'),
    sys = require('sys'),
    util = require('util'),
    ent = require('ent'),
    port = process.env.PORT || 5000;

app.use(urlrouter(function(app) {
    app.get('*',function(req,res){  
    res.redirect('https://neomorpion.herokuapp.com/'+req.url)
    });
    app.get('/', function(req, res, next) {
        req.url = '/index.html';
        connect.utils.parseUrl(req);
        next();
    });
}));

app.use(connect.static(__dirname + '/www'));

server.listen(port);

io.set('log level', 2);

//On créé ici les différentes variables qui vont servir au serveur pour gérer les salons et les joueurs
var usernames = {};
//Ici le système de jeu est basé sur des salons, contenus dans ce vecteur room. On pourrait très simplement rajouter aux utilisateurs la possibilité de créer des salons qui ferait appel côté serveur à une fonction faisant simplement un push dans ce vecteur puis ensuite rechargeant la liste des salons côté utilisateur
var rooms = ['Lobby', 'Salon 1', 'Salon 2', 'Salon 3', 'Salon 4'];
//Quand un joueur va se connecter à un salon, on va créer une instance de jeu lié au salon dans ce vecteur games
var games = {};


io.sockets.on('connection', function(socket) {

    //Permet d'afficher le nombre de personnes connectées sur la page d'accueil à l'utilisateur qui se connecte
    socket.emit('updatePlayersCount', Object.keys(usernames).length);

    //Lorsque l'utilisateur rentre un pseudo on va vérifier 
    socket.on('adduser', function(niouwusername) {
        

        newusername = ent.encode(niouwusername); //On évite le code html malicieux en escapant
        testusername = ent.encode(niouwusername.toLowerCase())

        if (usernames.hasOwnProperty(testusername)) { //On vérifie que le pseudo n'est pas déjà pris
            socket.emit('usernametaken');
            return;
        }



        // On stocke le pseudo dans le socket du client
        socket.username = newusername;

        // On ajoute le client dans la liste des pseudos
        usernames[testusername] = testusername;

        //On change l'affichage du client
        socket.emit('switchwelcomevisibility');
        socket.emit('switchroomvisibility');

        //On le connecte au lobby grâce à la gestion de salon fournie par socket
        default_room = 'Lobby';
        socket.join(default_room);
        socket.room = default_room; // On met dans le socket la valeur du salon pour y accéder facilement
        
        //On signale dans le chat que la personne st connectée (message différent pour la personne qui se connecte et les autres qui le voient se connecter)
        socket.emit('updatechat', '', '<span style="color:gray;">Vous êtes sur le <span style="color:red;">' + default_room + '</span> !</span>');
        socket.broadcast.to(default_room).emit('updatechat', '', '<span style="color:gray;">' + newusername + ' s\'est connecté au Lobby !</span>');

        //On prends le nombre de personnes dans les salons de jeu
        var nbusers = [];

        for (var i in rooms) {
            nbusers.push(checknumberofplayers(rooms[i]));
        }

        //On met à jour l'affichage des salons de jeu avec les nombres de joueurs et de spectateurs pour toutes les personnes dans le lobby
        io.sockets.in('Lobby').emit('updaterooms', rooms, 'Lobby', nbusers);

        socket.emit('updaterooms', rooms, socket.room, nbusers);

        //Quand une personne se connecte, toutes les personnes sur la page d'accueil voient le nombre de personne connecté se mettre à jour (tout le monde reçoit mais ne sert qu'à ceux sur la page d'accueil)
        io.sockets.emit('updatePlayersCount', Object.keys(usernames).length);


    });

    //On traite ici les envois au de messages chat 
    socket.on('sendchat', function(data) {

        if (!socket.username) {
            socket.emit('notconnected');
        } else {
            io.sockets.in(socket.room).emit('updatechat', socket.username + ' :', ent.encode(data)); //ent permet d'escaper les entités html pour éviter le code malicieux
        }
    });

    // Quand un client dans le Lobby clique sur un salon
    socket.on('switchRoom', function(newroom) {

        
        
            // On fait quitter au joueur son salon
            socket.leave(socket.room);
            //On émet dans le salon qu'il vient de quitter une notif
            socket.broadcast.to(socket.room).emit('updatechat', '', '<span style="color:gray;">' + socket.username + ' a quitté ce salon</span>');
        


        
        socket.join(newroom);
        socket.emit('updatechat', '', '<span style="color:gray;">Vous êtes connecté au <span style="color:red;">' + newroom + '</span><span>');


        // On met à jour dans le socket la valeur du salon pour y accéder facilement
        socket.room = newroom;
        socket.broadcast.to(newroom).emit('updatechat', '', '<span style="color:gray;">' + socket.username + ' a rejoins ce salon</span>');

        nbusers = [];

        for (var i in rooms) {
            nbusers.push(checknumberofplayers(rooms[i]));
        }


        io.sockets.in('Lobby').emit('updaterooms', rooms, 'Lobby', nbusers); //On met à jour dans le lobby les valeurs des joueurs dans les salons
        socket.emit('updaterooms', rooms, newroom, nbusers); //Permet ici d'afficher en haut dans le header le nom du salon dans lequel on se trouve

        //On change l'affichage du client qui passe en mode jeu
        socket.emit('switchroomvisibility'); 
        socket.emit('switchgamevisibility');


        //on gère le salon de jeu où la personne vient de rentrer
        if (socket.room in games) { //Si il y a un jeu lié au salon

            if (typeof games[socket.room].player2 != "undefined") { //On vérifie si un deuxième joueur avait été enregistré
                //Si oui le joueur devient spectateur
                games[socket.room].spectators.push(socket);
                socket.emit('spectating', games[socket.room].player1.username, games[socket.room].player2.username); //On précise au spectateur le match qu'il regarde

                //Si en plus une partie était déjà en cours on lui affiche le plateau de jeu dans son état
                if (games[socket.room].player1.ready == 1 && games[socket.room].player2.ready == 1) {
                    socket.emit('updateboard', games[socket.room].turn.username, games[socket.room].turn.id, games[socket.room].board);
                    socket.emit('switchboardvisibility');
                }
                return; //On casse pour pas que le client spectateur n'aille plus loin dans le code
            }


            //Si il n'y avait pas de deuxième joueur enregistré le client devient joueur 2
            games[socket.room].player2 = socket;
            //On fait appraitre chez les joueurs un bouton "commencer la partie"
            games[socket.room].player1.emit('requestgame', games[socket.room].player2.username);
            games[socket.room].player2.emit('requestgame', games[socket.room].player1.username);

        } else {
            //On créé dans l'objet Games un obket lié au salon dans lequel se trouve le joueur
            games[socket.room] = {
                player1: socket, //Le client devient joueur 1, on copie dans l'objet un pointeur vers son socket
                board: [ 
                    [0, 0, 0],
                    [0, 0, 0],
                    [0, 0, 0]
                ], //La board est nulle au départ. Dans la matrice 0 sera donc vide, 1 le joueur 1 et 2 le joueur 2
                spectators: [], //On créé un vecteur de spectateur
                turn: null, //On stockera ici le joueur à qui c'est le tour
            };

            games[socket.room].player1.emit('waiting'); //On dit au joueur 1 qu'il est tout seul et qu'il doit attendre un adversaire
           
        }
    });

    //Quand un joueur ou un spectateur clique sur la croix d'un salon de jeu pour revenir au lobby
    socket.on('leaveRoom', function() {

        //On change l'affichage
        socket.emit('switchgamevisibility');
        socket.emit('hideboardvisibility');
        socket.emit('switchroomvisibility');

        //On fait plein de tests (les uns à la suite des autres pour ne pas faire crasher le serveur)
        if (games[socket.room]) {
            if (games[socket.room].player1 && games[socket.room].player2) {
                if (games[socket.room].player1.id == socket.id || games[socket.room].player2.id == socket.id) {
                    if (games[socket.room].player1.ready == 1 && games[socket.room].player2.ready == 1) {
                        //Un des joueurs a quitté le jeu en cours de partie : on envoie une notif de déconnexion au joueur restant et aux spectateurs
                        socket.broadcast.to(socket.room).emit('gameended', games[socket.room].board, '<span class=\"icon-cross\"></span> ' + games[socket.room].player1.username + ' VS ' + games[socket.room].player2.username + ' <span class=\"icon-radio-unchecked\"></span>', 'Déconnexion de ' + socket.username + ' :(');
                    }
                }
            }
        }

        // +notif habituelle dans le chat
        socket.broadcast.to(socket.room).emit('updatechat', '', '<span style="color:gray;">' + socket.username + ' a quitté ce salon</span>');

        //On utilise une fonction qui va gérer l'état du salon
        roomchangestate(socket);

        //On lui fait rejoindre le lobby
        socket.leave(socket.room);
        socket.ready = 0;
        newroom = 'Lobby';
        socket.join(newroom);
        socket.room = newroom;

        var nbusers = [];

        for (var i in rooms) {
            nbusers.push(checknumberofplayers(rooms[i]));
        }

        //On met tous les affichages du nombre de joueurs dans les salons à jour
        io.sockets.in('Lobby').emit('updaterooms', rooms, newroom, nbusers);
        socket.emit('updaterooms', rooms, newroom, nbusers);
        socket.emit('updatechat', '', '<span style="color:gray;">Vous êtes revenu sur le <span style="color:red;">' + newroom + '</span> !</span>');
    });

    //Lorsque un joueur clique sur "commencer la partie"
    socket.on('gamerequested', function() {

        if (socket.id == games[socket.room].player1.id) {
            games[socket.room].player1.ready = 1;
        }
        if (socket.id == games[socket.room].player2.id) {
            games[socket.room].player2.ready = 1;
        }

        //Lorsque les deux joeuurs sont prêt on commence le jeu
        if (games[socket.room].player2.ready == 1 && games[socket.room].player1.ready == 1) {
            io.sockets.in(socket.room).emit('switchboardvisibility');
            games[socket.room].turn = games[socket.room].player1;
            io.sockets.in(socket.room).emit('updateboard', games[socket.room].turn.username, games[socket.room].turn.id, games[socket.room].board);
            io.sockets.in(socket.room).emit('updatechat', '', '<span style="color:#48ba69;">Début du match !</span>');
        }

    });

    //Fonction qui gère le jeu en cours On récupère la case où le joueur à cliqué
    socket.on('processgame', function(row, col) {

        if (games[socket.room].turn.id == socket.id) {

            //On regarde c'était le tour de quel joueur
            if (socket.id == games[socket.room].player1.id) {
                var boardchange = 1;
                games[socket.room].turn = games[socket.room].player2; //On change de joueur qui peut jouer


            } else {
                var boardchange = 2;
                games[socket.room].turn = games[socket.room].player1; //On change de joueur qui peut jouer

            }

            games[socket.room].board[row][col] = boardchange; //On fait le changement dans la matrice du jeu


            //on vérifie si il y a victoire
            if (checkifwin(socket.room)) {

                io.sockets.in(socket.room).emit('updateboard', '', '', games[socket.room].board);              

                //On met une jolie notif de fin
                io.sockets.in(socket.room).emit('gameended', games[socket.room].board, '<span class=\"icon-cross\"></span> ' + games[socket.room].player1.username + ' VS ' + games[socket.room].player2.username + ' <span class=\"icon-radio-unchecked\"></span>', 'Victoire de ' + socket.username + ' !');

                var nbplayers = checknumberofplayers(socket.room);
                resetroomaftermatch(socket.room, nbplayers); //On reset le jeu

                io.sockets.in(socket.room).emit('updatechat', '', '<span style="color:#48ba69;">Victoire de ' + socket.username + ' !</span>');

                return;
            }

            //Idem avec match nul
            if (checkifnull(socket.room)) {

                io.sockets.in(socket.room).emit('updateboard', '', '', games[socket.room].board);

                io.sockets.in(socket.room).emit('gameended', games[socket.room].board, '<span class=\"icon-cross\"></span> ' + games[socket.room].player1.username + " VS " + games[socket.room].player2.username + ' <span class=\"icon-radio-unchecked\"></span>', "C'est un match nul !");

                var nbplayers = checknumberofplayers(socket.room);
                resetroomaftermatch(socket.room, nbplayers);

                io.sockets.in(socket.room).emit('updatechat', '', '<span style="color:#48ba69;">Match null !</span>');

                return;
            }

            //Si pas victoire ou nul, on continue le jeu avec la board mise à jour
            io.sockets.in(socket.room).emit('updateboard', games[socket.room].turn.username, games[socket.room].turn.id, games[socket.room].board);

        }


    });

    // Quand il y a déconnexion brutale
    socket.on('disconnect', function() {
    
        //on reteste en cascade (toujours pour éviter le crash du serveur si certaines valeurs ne sont pas définies) si le joueur était dans un jeu et on arrête le jeu en conséquence
        if (games[socket.room]) {
            if (games[socket.room].player1 && games[socket.room].player2) {
                if (games[socket.room].player1.id == socket.id || games[socket.room].player2.id == socket.id) {
                socket.broadcast.to(socket.room).emit('gameended', games[socket.room].board, '<span class=\"icon-cross\"></span> ' + games[socket.room].player1.username + ' VS ' + games[socket.room].player2.username + ' <span class=\"icon-radio-unchecked\"></span>', 'Déconnexion de ' + socket.username + ' :(');
                if (games[socket.room].player1.ready == 1 && games[socket.room].player2.ready == 1) {
                    socket.broadcast.to(socket.room).emit('switchboardvisibility');
                }
            }
            }
        }

        roomchangestate(socket);

        //On oublie pas de supprimer l'utilisateur de la liste
        delete usernames[socket.username];
        // on évite d'envoyer les messages à la room null lorsque la personne n'est pas connectée
        for (var i in rooms) {
            socket.broadcast.to(rooms[i]).emit('updatechat', '', '<span style="color:grey;">' + socket.username + ' s\'est déconnecté</span>');
        }
        
        socket.leave(socket.room);
        io.sockets.emit('updatePlayersCount', Object.keys(usernames).length);

    });

    //Fonctions pour le nombre de joueurs
    var checknumberofplayers = function(room) {
        var nbusers = Object.keys(io.sockets.clients(room)).length;
        return nbusers;
    };

    socket.on('checknumberofplayers', function(room) {
        var nbusers = checknumberofplayers(room);
        socket.emit('numberofplayers', nbusers);
    });

    //appelé si retour au lobby ou déconnexion
    var roomchangestate = function(socket) {

        //permet de faire des action différentes en fonction du nombre de joueur restant le salon quand on enlève la personne qui part

        if (socket.room && games[socket.room]) {
            var nbplayers = checknumberofplayers(socket.room) - 1; //-1 car on a pas encore fait le socket.leave(socket.room); quand cette fonction est appelée


            if (nbplayers == 0) {
                delete games[socket.room]; //pas de joueur restant : on supprime le salon Permettrait d'éviter si on laissait la possibiltié aux joueurs de créer leur salon d'avoir 3000 salons car ils ne sont pas supprimés (à la création du salon, le joueur serait dedans, donc tant qu'il y a un joueur dans le salon le salon pourrait exister)
                var bool = true;
            } else if (nbplayers == 1) {

                //On supprime les références au joueur qui vient de se déconnecter (2 personnes dans le salon donc les deux sont joueurs)
                var bool = true;
                if (games[socket.room].player1.id == socket.id) {

                    games[socket.room].player1.ready = 0;

                    games[socket.room].player1 = games[socket.room].player2;

                    delete games[socket.room].player2;
                    games[socket.room].player1.ready = 0;

                } else {
                    games[socket.room].player2.ready = 0;

                    delete games[socket.room].player2;
                    games[socket.room].player1.ready = 0;

                }


            } else if (nbplayers >= 2) {

                //Si au moins un spectateur, si c'est un spectateur qui quitte, on met à jour le vecteur de spectateur. Si c'est un joueur, le premier spectateur arrivé devient joueur
                if (games[socket.room].player1.id == socket.id) {
                    games[socket.room].player1.ready = 0;
                    games[socket.room].player1 = games[socket.room].spectators[0];
                    games[socket.room].spectators.splice(0, 1);
                    games[socket.room].player1.ready = 0;
                    games[socket.room].player2.ready = 0;

                    var bool = true;
                } else if (games[socket.room].player2.id == socket.id) {

                    games[socket.room].player2.ready = 0;
                    games[socket.room].player2 = games[socket.room].spectators[0];
                    games[socket.room].spectators.splice(0, 1);
                    games[socket.room].player1.ready = 0;
                    games[socket.room].player2.ready = 0;
                    var bool = true;
                } else {
                    var index = games[socket.room].spectators.indexOf(socket);
                    var bool = false;

                    if (index > -1) {
                        games[socket.room].spectators.splice(index, 1);
                    }
                }



            }

            resetroomafterdisconnect(socket.room, nbplayers, bool); //On reset la room pour permettre un nouveau match
        }
    }

    //On checke si victoire
    var checkifwin = function(room) {
        var board = games[room].board;
        var bool = false;

        // verifie par ligne
        for (var i = 0; i <= 2; i++) {
            if (board[i][0] != 0 && board[i][0] == board[i][1] && board[i][0] == board[i][2]) {

                bool = true;
            }
        }

        // verifie par colonne
        for (var j = 0; j <= 2; j++) {
            if (board[0][j] != 0 && board[0][j] == board[1][j] && board[0][j] == board[2][j]) {

                bool = true;
            }
        }

        // verifie par diagonale 1
        if (board[0][0] != 0 && board[0][0] == board[1][1] && board[0][0] == board[2][2]) {

            bool = true;
        }

        // verifie la digonale 2
        if (board[0][2] != 0 && board[0][2] == board[1][1] && board[0][2] == board[2][0]) {

            bool = true;
        }


        return bool;
    }

    //On checke si nul
    var checkifnull = function(room) {
        var board = games[room].board;
        var test;
        var bool = false;

        if (board[0][0] != 0 && board[0][1] != 0 && board[0][2] != 0 && board[1][0] != 0 && board[1][1] != 0 && board[1][2] != 0 && board[2][0] != 0 && board[2][1] != 0 && board[2][2] != 0) {
            bool = true;
        }

        return bool;
    }

    var resetroomaftermatch = function(room, nbplayers) {


        if (games[room]) {

            //On reset la board
            games[room].board = [
                [0, 0, 0],
                [0, 0, 0],
                [0, 0, 0]
            ];

            if (nbplayers == 1) {
                //si il ne reste qu'un joueur on met à jour l'affichage en conséquences
                games[room].player1.ready = 0;
                io.sockets.in(socket.room).emit('hideboardvisibility');
                io.sockets.in(socket.room).emit('updateboard', "", games[socket.room].board);
                games[socket.room].player1.emit('waiting');
            }

            if (nbplayers >= 2) {

                //on change le joueur qui commence en premier
                var temp;
                temp=games[room].player1;
                games[room].player1=games[room].player2;
                games[room].player2=temp;

                //on met à jour leur ready
                games[room].player1.ready = 0;
                games[room].player2.ready = 0;

                for (var i in games[socket.room].spectators) {
                    games[socket.room].spectators[i].emit('spectating', games[socket.room].player1.username, games[socket.room].player2.username);
                }

                io.sockets.in(socket.room).emit('hideboardvisibility');

                //on fait apparaitre le bouton commencer partie pour les deux joueurs
                games[room].player1.emit('requestgame', games[room].player2.username);
                games[room].player2.emit('requestgame', games[room].player1.username);
            }
        }
    }

    //On reset la room après une déconnexion
    var resetroomafterdisconnect = function(room, nbplayers, bool) {


        if (games[room]) {




            if (nbplayers == 1) {
                games[room].board = [
                    [0, 0, 0],
                    [0, 0, 0],
                    [0, 0, 0]
                ];
                games[room].player1.ready = 0;
                io.sockets.in(socket.room).emit('hideboardvisibility');
                io.sockets.in(socket.room).emit('updateboard', "", games[socket.room].board);
                games[socket.room].player1.emit('waiting');
            }

            if (nbplayers >= 2) {

                if (bool) {
                    games[room].board = [
                        [0, 0, 0],
                        [0, 0, 0],
                        [0, 0, 0]
                    ];

                    for (var i in games[socket.room].spectators) {
                        games[socket.room].spectators[i].emit('spectating', games[socket.room].player1.username, games[socket.room].player2.username);
                    }
                    io.sockets.in(socket.room).emit('updateboard', "", games[socket.room].board);
                    io.sockets.in(socket.room).emit('hideboardvisibility');
                    games[room].player1.emit('requestgame', games[room].player2.username);
                    games[room].player2.emit('requestgame', games[room].player1.username);
                } else {

                }
            }
        }
    }



});
