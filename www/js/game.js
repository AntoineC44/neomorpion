var socket = io.connect(window.location.hostname);

//Au chargement de la page
$(function() {

    //Pour envoyer le choix du pseudo au serveur
    $('#join').bind('click', function() {
        $('#error').html('&nbsp;');
        if (!$('#nickname').val().length) {
            $('#error').html('Vous devez choisir un pseudo !');
            return;
        }
        socket.emit('adduser', $('#nickname').val());
    });

    //Pour notifier le serveur d'une demande de quitter le serveur lorsque l'on clique sur la croix en haut à droite dans un salon
    $('#exit').click(function() {
        socket.emit('leaveRoom');
    });

    //Cacher les éléments à cacher au lancement de lancement la page
    $('#gameended').toggle();
    $('#rooms').toggle();
    $('#game').toggle();
    $('#gameboard').toggle();

    //Lorsque l'utilisateur fait entrée dans le input du chat : clique sur un bouton (invisible) et laisse le focus sur l'input pour retapper directement
    $('#data').keypress(function(e) {
        if (e.which == 13) {
            $(this).blur();
            $('#datasend').focus().click();
            $(this).focus().select();
        }
    });
    
    //Le bouton cliqué permet d'envoyer au serveur le message
    $('#datasend').click(function() {
        var message = $('#data').val();
        $('#data').val('');
        if (message) {
            socket.emit('sendchat', message);
        }
    });

});

//pour updater le chat
socket.on('updatechat', function(username, data) {
    $('#conversation').append('<b>' + username + '</b> ' + data + '<br>');
});

//Pour afficher le nb de joueurs sur l'écran d'accueil
socket.on('updatePlayersCount', function(number) {
    if (!number) {
        numerb = "0";
    }
    $('#players').html(number);
});

//Permet d'empecher de chatter tant que l'on est pas connecté
socket.on('notconnected', function() {
    alert("Tu dois te connecter avant de pouvoir accéder au chat !");
});

//empêche de prendre un pseudo déjà pris
socket.on('usernametaken', function() {
    $('#error').html('Ce pseudo est déjà pris !');
});

//Fonctions pour cacher/afficher dynamiquement les éléments graphiques
socket.on('switchwelcomevisibility', function() {
    $('#welcome').toggle();
});

socket.on('switchroomvisibility', function() {
    $('#rooms').toggle();
    $('#gameinfo').html('');
});

socket.on('switchgamevisibility', function() {
    $('#game').toggle();
});

socket.on('switchboardvisibility', function() {
    $('#gameboard').toggle();
});

socket.on('hideboardvisibility', function() {
    $('#gameboard').hide();
});


//Permet de mettre à jour l'affichage des salons disponibles et le nombre de joueurs/spectateurs dedans, mais également de préciser dans quel salon on se trouve
socket.on('updaterooms', function(rooms, current_room, nbusers) {
    $('#roomcards').empty();
    $.each(rooms, function(key, value) {
        if (value != 'Lobby') {

            if (nbusers[key] <= 2) {
                nbjoueurs = nbusers[key];
                nbspec = 0;
            } else {
                nbjoueurs = 2;
                nbspec = nbusers[key] - 2;
            }
            $('#roomcards').append('<a href="#" onclick="switchRoom(\'' + value + '\')"><div class="roomcard"><center>' + value + '</center><h2></h2><table style="width:100%"><tr><td  class="left">Joueurs</td><td>' + nbjoueurs + '</td></tr><tr><td  class="left">Spectateurs</td><td>' + nbspec + '</td> </tr></table></div></a>');
        }
    });



    $('#salon').html(current_room);
});

//Fonction appelée lorsque l'on choisi un salon
function switchRoom(room) {
    socket.emit('switchRoom', room);
}

//Fonction activée lorsqu'un adversaire est disponible, permet de dire au serveur que l'on est prêt à jouer
socket.on('requestgame', function(username) {
    $('#state').html('Adversaire : <b>' + username + '</b>');
    $('#gamestate').html('<input type="button" onclick="gamerequest()" value="Commencer une partie" id="gamerequest" />');

});

//Fonction appelée lors du click sur "Commencer une partie"
function gamerequest() {
    $('#gamestate').html('En attente de l\'adversaire');
    socket.emit('gamerequested');

}

//En attente que l'adversaire envoie aussi un gamerequested
socket.on('waiting', function() {
    $('#state').html('En attente d\'un adversaire');
    $('#gamestate').html('');
});

socket.on('spectating', function(username1, username2) {
    $('#state').html('Vous observez le match<br/><b><span class=\"icon-cross\"></span> ' + username1 + '</b> vs <b>' + username2 + ' <span class=\"icon-radio-unchecked\"></span></b>');
    $('#gamestate').html('Attente du début de partie...');
});

//Pour mettre à jour le tableau de jeu. Fonction commune à tous les utilisateurs. La comparaison du socket.id du joueur devant joué envoyé par le serveur avec le socket.id local permet de déterminer qui reçoit sur son ordinateur la possibilité de jouer malgré la fonction commune à tous
socket.on('updateboard', function(username, socketid, board) {

    if (board) {
        //On vide la gameboard avant de le reremplir en fonction de la matrice du jeu envoyée par le serveur
        $('#gameboard').empty();

        //On compare ici si l'id local correspond au joueur à jouer
        if (socket.socket.sessionid == socketid) {

            $('#gamestate').html('C\'est votre tour !');
            var onclikedij = [
                ["onclick=clicked(this)", "onclick=clicked(this)", "onclick=clicked(this)"],
                ["onclick=clicked(this)", "onclick=clicked(this)", "onclick=clicked(this)"],
                ["onclick=clicked(this)", "onclick=clicked(this)", "onclick=clicked(this)"]
            ];
            var cssij = [
                ["cursor:pointer", "cursor:pointer", "cursor:pointer"],
                ["cursor:pointer", "cursor:pointer", "cursor:pointer"],
                ["cursor:pointer", "cursor:pointer", "cursor:pointer"]
            ];

        } else {

            $('#gamestate').html('Au tour de ' + username);
            //Si ce n'est pas à ce joueur de jouer (ou si il est spectateur), on lui envlève la possibilité de cliquer sur les cases et on ne met pas un curseur pointer
            var cssij = [
                ["", "", ""],
                ["", "", ""],
                ["", "", ""]
            ];
            var onclikedij = [
                ["", "", ""],
                ["", "", ""],
                ["", "", ""]
            ];
        }

        var valij = [
            ["&nbsp;", "&nbsp;", "&nbsp;"],
            ["&nbsp;", "&nbsp;", "&nbsp;"],
            ["&nbsp;", "&nbsp;", "&nbsp;"]
        ];

        //On remplace ici toutes les valeurs de valij, cssij et onclickedij en fonction de la board envoyée par le serveur, avec board[i][j]=0 personne n'a joué dans la case, board[i][j]=1 le joueur 1 a joué dans cette case, board[i][j]=2 le joueur 2 a joué dans cette case

        for (i = 0; i <= 2; i++) {
            for (j = 0; j <= 2; j++) {
                if (board[i][j] == 1) {
                    valij[i][j] = "<span class=\"icon-cross\"></span>";
                    cssij[i][j] = "";
                    onclikedij[i][j] = "";
                } else if (board[i][j] == 2) {
                    valij[i][j] = "<span class=\"icon-radio-unchecked\"></span>";
                    cssij[i][j] = "";
                    onclikedij[i][j] = "";
                }
            }
        }



        $('#gameboard').append('<div row="0" col="0" ' + onclikedij[0][0] + '  style="' + cssij[0][0] + '">' + valij[0][0] + '</div>');
        $('#gameboard').append('<div row="0" col="1" ' + onclikedij[0][1] + '  class="leftright" style="' + cssij[0][1] + '">' + valij[0][1] + '</div>');
        $('#gameboard').append('<div row="0" col="2" ' + onclikedij[0][2] + '  style="' + cssij[0][2] + '">' + valij[0][2] + '</div>');
        $('#gameboard').append('<div row="1" col="0" ' + onclikedij[1][0] + '  class="updown" style="' + cssij[1][0] + '">' + valij[1][0] + '</div>');
        $('#gameboard').append('<div row="1" col="1" ' + onclikedij[1][1] + '  class="middle" style="' + cssij[1][1] + '">' + valij[1][1] + '</div>');
        $('#gameboard').append('<div row="1" col="2" ' + onclikedij[1][2] + '  class="updown" style="' + cssij[1][2] + '">' + valij[1][2] + '</div>');
        $('#gameboard').append('<div row="2" col="0" ' + onclikedij[2][0] + '  style="' + cssij[2][0] + '">' + valij[2][0] + '</div>');
        $('#gameboard').append('<div row="2" col="1" ' + onclikedij[2][1] + '  class="leftright" style="' + cssij[2][1] + '">' + valij[2][1] + '</div>');
        $('#gameboard').append('<div row="2" col="2" ' + onclikedij[2][2] + '  style="' + cssij[2][2] + '">' + valij[2][2] + '</div>');
    }


});

//Le joueur ayant la main déclenche cette fonction en cliquant sur une case, on envoie la case où il a cliqué (stocké dans l'id des div)
function clicked(item) {
    var row = $(item).attr("row");
    var col = $(item).attr("col");

    socket.emit('processgame', row, col);
}

//Si le serveur envoie une notif de fin de jeu (déconnexion d'un des joueurs, victoire, match nul) on déclenche cette fonction qui envoie une notif affichant le tableau mais aussi l'état
socket.on('gameended', function(board, matchdetails, conclusion) {

	
    if (board) {} else {
        board = [
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0]
        ];
    }



    var valij = [
        ["&nbsp;", "&nbsp;", "&nbsp;"],
        ["&nbsp;", "&nbsp;", "&nbsp;"],
        ["&nbsp;", "&nbsp;", "&nbsp;"]
    ];

  

    for (i = 0; i <= 2; i++) {
        for (j = 0; j <= 2; j++) {
            if (board[i][j] == 1) {
                    valij[i][j] = "<span class=\"icon-cross\"></span>";                 
                } else if (board[i][j] == 2) {
                    valij[i][j] = "<span class=\"icon-radio-unchecked\"></span>";                 
                }
        }
    }

    $('#finalgameboard').empty();

    $('#finalgameboard').append('<div row="0" col="0"  >' + valij[0][0] + '</div>');
    $('#finalgameboard').append('<div row="0" col="1"  class="leftright">' + valij[0][1] + '</div>');
    $('#finalgameboard').append('<div row="0" col="2" >' + valij[0][2] + '</div>');
    $('#finalgameboard').append('<div row="1" col="0"   class="updown" >' + valij[1][0] + '</div>');
    $('#finalgameboard').append('<div row="1" col="1"  class="middle">' + valij[1][1] + '</div>');
    $('#finalgameboard').append('<div row="1" col="2"  class="updown">' + valij[1][2] + '</div>');
    $('#finalgameboard').append('<div row="2" col="0" >' + valij[2][0] + '</div>');
    $('#finalgameboard').append('<div row="2" col="1"  class="leftright">' + valij[2][1] + '</div>');
    $('#finalgameboard').append('<div row="2" col="2" >' + valij[2][2] + '</div>');

    $('#matchdetails').html(matchdetails);
    $('#conclusion').html(conclusion);
    $('#gameended').fadeTo(100, 1);


    //Le bloc fonction qui permet de déclencher un compteur qui finit par cacher la notification au bout de 5 secondes grâce à une fonction de callback sur le span "countdown"
    $.fn.countdown = function(callback, duration) {

        var container = $(this[0]).html(duration);

        var countdown = setInterval(function() {

            if (--duration) {

                $('#countdown').html(duration);

            } else {

                clearInterval(countdown);

                callback.call(container);
            }

        }, 1000);

    };

    $("#countdown").countdown(redirect, 5);

    function redirect() {
        $('#countdown').html(0);
        $('#gameended').fadeTo(1000, 0); //On cache la notif
        setTimeout(function() {
            $('#gameended').toggle(); //On la réaffiche
        }, 1003);

    }


});
