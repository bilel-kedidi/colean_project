var user = require('./../user.js'),
	posts = require('./../posts.js'),
	postTools = require('../postTools'),
	fs = require('fs'),
	utils = require('./../../public/src/utils.js'),
	path = require('path'),
	winston = require('winston'),
	nconf = require('nconf'),
	meta = require('./../meta'),
	badges = require('../badges'),
	async= require('async'),
	RDB = require('./../redis'),
	websockets = require('./../websockets.js');

(function (User) {
	User.create_routes = function (app) {

		app.get('/uid/:uid', function (req, res) {

			if (!req.params.uid)
				return res.redirect('/404');

			user.getUserData(req.params.uid, function (err, data) {
				if (data) {
					res.send(data);
				} else {
					res.json(404, {
						error: "User doesn't exist!"
					});
				}
			});
		});

		app.namespace('/users', function () {
			app.get('', function (req, res) {
				app.build_header({
					req: req,
					res: res
				}, function (err, header) {
					res.send(header + app.create_route("users", "users") + templates['footer']);
				});
			});

			app.get('/latest', function (req, res) {
				app.build_header({
					req: req,
					res: res
				}, function (err, header) {
					res.send(header + app.create_route("users/latest", "users") + templates['footer']);
				});
			});

			app.get('/sort-posts', function (req, res) {
				app.build_header({
					req: req,
					res: res
				}, function (err, header) {
					res.send(header + app.create_route("users/sort-posts", "users") + templates['footer']);
				});
			});

			app.get('/sort-reputation', function (req, res) {
				app.build_header({
					req: req,
					res: res
				}, function (err, header) {
					res.send(header + app.create_route("users/sort-reputation", "users") + templates['footer']);
				});
			});

			app.get('/online', function (req, res) {
				app.build_header({
					req: req,
					res: res
				}, function (err, header) {
					res.send(header + app.create_route("users/online", "users") + templates['footer']);
				});
			});

			app.get('/search', function (req, res) {
				app.build_header({
					req: req,
					res: res
				}, function (err, header) {
					res.send(header + app.create_route("users/search", "users") + templates['footer']);
				});
			});
		});

		app.namespace('/user', function () {
			app.get('/:userslug', function (req, res, next) {

				if (!req.params.userslug) {
					next();
					return;
				}

				user.getUidByUserslug(req.params.userslug, function (err, uid) {
					if (!uid) {
						return next();
					}

					app.build_header({
						req: req,
						res: res
					}, function (err, header) {
						res.send(header + app.create_route('user/' + req.params.userslug, 'account') + templates['footer']);
					});

				});
			});

			app.get('/:user_oid/:userslug', function (req, res, next) {

				if (!req.params.user_oid) {
					next();
					return;
				}
				/*
				user.getUserField(req.params.user_oid, 'userslug', function (err, userslug) {
					res.redirect('/user/' + userslug);
				});
				*/
				user.getOrCreateUser(req.params.user_oid, function (err, uid) {
					if (!uid) {
						return next();
					}
					user.getUserField(uid, 'userslug', function (err, userslug) {
						console.log('userslug', userslug);
						res.redirect('/user/' + userslug);
					});
				});
			});

			app.get('/:userslug/edit', function (req, res) {

				if (!req.user)
					return res.redirect('/403');

				user.getUserField(req.user.uid, 'userslug', function (err, userslug) {
					if (req.params.userslug && userslug === req.params.userslug) {
						app.build_header({
							req: req,
							res: res
						}, function (err, header) {
							res.send(header + app.create_route('user/' + req.params.userslug + '/edit', 'accountedit') + templates['footer']);
						});
					} else {
						return res.redirect('/404');
					}
				});
			});

			app.get('/:userslug/settings', function (req, res) {

				if (!req.user)
					return res.redirect('/403');

				user.getUserField(req.user.uid, 'userslug', function (err, userslug) {
					if (req.params.userslug && userslug === req.params.userslug) {
						app.build_header({
							req: req,
							res: res
						}, function (err, header) {
							res.send(header + app.create_route('user/' + req.params.userslug + '/settings', 'accountsettings') + templates['footer']);
						})
					} else {
						return res.redirect('/404');
					}
				});
			});

			app.post('/uploadpicture', function (req, res) {
				if (!req.user)
					return res.redirect('/403');

				var uploadSize = meta.config.maximumProfileImageSize || 256;

				if (req.files.userPhoto.size > uploadSize * 1024) {
					res.send({
						error: 'Images must be smaller than ' + uploadSize + ' kb!'
					});
					return;
				}

				var allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif'];

				if (allowedTypes.indexOf(req.files.userPhoto.type) === -1) {
					res.send({
						error: 'Allowed image types are png, jpg and gif!'
					});
					return;
				}

				user.getUserField(req.user.uid, 'uploadedpicture', function (err, oldpicture) {
					if (!oldpicture) {
						uploadUserPicture(req.user.uid, path.extname(req.files.userPhoto.name), req.files.userPhoto.path, res);
						return;
					}

					var absolutePath = path.join(process.cwd(), nconf.get('upload_path'), path.basename(oldpicture));

					fs.unlink(absolutePath, function (err) {
						if (err) {
							winston.err(err);
						}

						uploadUserPicture(req.user.uid, path.extname(req.files.userPhoto.name), req.files.userPhoto.path, res);
					});
				});
			});
		});

		function uploadUserPicture(uid, extension, tempPath, res) {
			if (!extension) {
				res.send({
					error: 'Error uploading file! Error : Invalid extension!'
				});
				return;
			}

			var filename = uid + '-profileimg' + extension;
			var uploadPath = path.join(process.cwd(), nconf.get('upload_path'), filename);

			winston.info('Attempting upload to: ' + uploadPath);

			var is = fs.createReadStream(tempPath);
			var os = fs.createWriteStream(uploadPath);

			is.on('end', function () {
				fs.unlinkSync(tempPath);

				var imageUrl = nconf.get('upload_url') + filename;

				user.setUserField(uid, 'uploadedpicture', imageUrl);
				user.setUserField(uid, 'picture', imageUrl);

				require('node-imagemagick').crop({
					srcPath: uploadPath,
					dstPath: uploadPath,
					width: 128,
					height: 128
				}, function (err, stdout, stderr) {
					if (err) {
						winston.err(err);
					}

					res.json({
						path: imageUrl
					});
				});
			});

			os.on('error', function (err) {
				fs.unlinkSync(tempPath);
				winston.err(err);
			});

			is.pipe(os);
		}

		app.get('/user/:userslug/following', function (req, res) {

			if (!req.user)
				return res.redirect('/403');

			user.getUidByUserslug(req.params.userslug, function (err, uid) {
				if (!uid) {
					res.redirect('/404');
					return;
				}

				app.build_header({
					req: req,
					res: res
				}, function (err, header) {
					res.send(header + app.create_route('user/' + req.params.userslug + '/following', 'following') + templates['footer']);
				});
			});
		});

		app.get('/user/:userslug/followers', function (req, res) {

			if (!req.user)
				return res.redirect('/403');

			user.getUidByUserslug(req.params.userslug, function (err, uid) {
				if (!uid) {
					res.redirect('/404');
					return;
				}
				app.build_header({
					req: req,
					res: res
				}, function (err, header) {
					res.send(header + app.create_route('user/' + req.params.userslug + '/followers', 'followers') + templates['footer']);
				});
			});
		});

		app.get('/user/:userslug/favourites', function (req, res) {

			if (!req.user)
				return res.redirect('/403');

			user.getUidByUserslug(req.params.userslug, function (err, uid) {
				if (!uid) {
					res.redirect('/404');
					return;
				}
				app.build_header({
					req: req,
					res: res
				}, function (err, header) {
					res.send(header + app.create_route('user/' + req.params.userslug + '/favourites', 'favourites') + templates['footer']);
				});
			});
		});

		app.get('/api/user/:userslug/following', function (req, res) {
			var callerUID = req.user ? req.user.uid : '0';

			getUserDataByUserSlug(req.params.userslug, callerUID, function (userData) {
				if (userData) {
					user.getFollowing(userData.uid, function (followingData) {
						userData.following = followingData;
						userData.followingCount = followingData.length;
						res.json(userData);
					});

				} else {
					res.json(404, {
						error: 'User not found!'
					});
				}
			});
		});

		app.get('/api/user/:userslug/followers', function (req, res) {
			var callerUID = req.user ? req.user.uid : '0';

			getUserDataByUserSlug(req.params.userslug, callerUID, function (userData) {
				if (userData) {
					user.getFollowers(userData.uid, function (followersData) {
						userData.followers = followersData;
						userData.followersCount = followersData.length;
						res.json(userData);
					});
				} else {
					res.json(404, {
						error: 'User not found!'
					});
				}
			});
		});

		app.get('/api/user/:userslug/edit', function (req, res) {
			var callerUID = req.user ? req.user.uid : '0';

			getUserDataByUserSlug(req.params.userslug, callerUID, function (userData) {
				res.json(userData);
			});
		});

		app.get('/api/user/:userslug/settings', function (req, res, next) {
			var callerUID = req.user ? req.user.uid : '0';

			user.getUidByUserslug(req.params.userslug, function (err, uid) {
				if (!uid) {
					res.json(404, {
						error: 'User not found!'
					});
					return;
				}

				if (uid != callerUID || callerUID == '0') {
					res.json(403, {
						error: 'Not allowed!'
					});
					return;
				}


				user.getUserFields(uid, ['username', 'userslug', 'showemail'], function (err, userData) {
					if (err)
						return next(err);

					if (userData) {
						if (userData.showemail && userData.showemail === "1")
							userData.showemail = "checked";
						else
							userData.showemail = "";
						res.json(userData);
					} else {
						res.json(404, {
							error: 'User not found!'
						});
					}
				});
			});
		});

		app.get('/api/user/:userslug/favourites', function (req, res, next) {
			var callerUID = req.user ? req.user.uid : '0';

			user.getUidByUserslug(req.params.userslug, function (err, uid) {
				if (!uid) {
					res.json(404, {
						error: 'User not found!'
					});
					return;
				}

				if (uid != callerUID || callerUID == '0') {
					res.json(403, {
						error: 'Not allowed!'
					});
					return;
				}

				user.getUserFields(uid, ['username', 'userslug'], function (err, userData) {
					if (err)
						return next(err);

					if (userData) {
						posts.getFavourites(uid, function (err, posts) {
							if (err)
								return next(err);
							userData.posts = posts;
							userData.show_nofavourites = posts.length ? 'hide' : 'show';
							res.json(userData);
						});
					} else {
						res.json(404, {
							error: 'User not found!'
						});
					}
				});
			});
		});

		app.get('/api/user/:userslug', function (req, res) {
			var callerUID = req.user ? req.user.uid : '0';

			getUserDataByUserSlug(req.params.userslug, callerUID, function (userData) {
				if (userData) {
					user.isFollowing(callerUID, userData.theirid, function (isFollowing) {
						posts.getPostsByUid(callerUID, userData.theirid, 0, 9, function (posts) {
							userData.posts = posts.filter(function (p) {
								return p && p.deleted !== "1";
							});
							userData.isFollowing = isFollowing;
							if (!userData.profileviews)
								userData.profileviews = 1;
							if (callerUID !== userData.uid)
								user.incrementUserFieldBy(userData.uid, 'profileviews', 1);

							postTools.parse(userData.signature, function (err, signature) {
								userData.signature = signature;
								res.json(userData);
							});
						});
					});
				} else {
					res.json(404, {
						error: 'User not found!'
					});
				}
			});
		});

		app.get('/api/users', getUsersSortedByJoinDate);
		app.get('/api/users/sort-posts', getUsersSortedByPosts);
		app.get('/api/users/sort-reputation', getUsersSortedByReputation);
		app.get('/api/users/latest', getUsersSortedByJoinDate);
		app.get('/api/users/online', getOnlineUsers);
		app.get('/api/users/search', getUsersForSearch);


		function getUsersSortedByJoinDate(req, res) {
			user.getUsers('users:joindate', 0, 49, function (err, data) {
				res.json({
					search_display: 'none',
					loadmore_display: 'block',
					users: data,
					show_anon: 'hide'
				});
			});
		}

		function getUsersSortedByPosts(req, res) {
			user.getUsers('users:postcount', 0, 49, function (err, data) {
				res.json({
					search_display: 'none',
					loadmore_display: 'block',
					users: data,
					show_anon: 'hide'
				});
			});
		}

		function getUsersSortedByReputation(req, res) {
			user.getUsers('users:reputation', 0, 49, function (err, data) {
				res.json({
					search_display: 'none',
					loadmore_display: 'block',
					users: data,
					show_anon: 'hide'
				});
			});
		}

		function getOnlineUsers(req, res) {
			user.getUsers('users:online', 0, 49, function (err, data) {

				var onlineUsers = [];
				var done = 0;
				function iterator(user, callback) {
					onlineUsers.push(user);
					callback(null);
				}

				//var anonymousUserCount = websockets.getOnlineAnonCount();

				async.each(data, iterator, function(err) {
					res.json({
						search_display: 'none',
						loadmore_display: (onlineUsers.length < 50) ? 'hide' : 'block',
						users: onlineUsers,
						anonymousUserCount: 0,
						show_anon: 'hide'
					});
				});
			});
		}

		function getUsersForSearch(req, res) {
			res.json({
				search_display: 'block',
				loadmore_display: 'none',
				users: [],
				show_anon: 'hide'
			});
		}

		function getUserDataByUserSlug(userslug, callerUID, callback) {
			user.getUidByUserslug(userslug, function (err, uid) {

				if (uid === null) {
					callback(null);
					return;
				}

				user.getUserData(uid, function (err, data) {
					if (data) {
						var email = data.email;
						data.joindate = new Date(parseInt(data.joindate, 10)).toISOString();

						if (!data.birthday) {
							data.age = '';
						} else {
							data.age = new Date().getFullYear() - new Date(data.birthday).getFullYear();
						}

						function canSeeEmail() {
							return callerUID == uid || (data.email && (data.showemail && data.showemail === "1"));
						}

						if (!canSeeEmail())
							data.email = "";

						if (callerUID == uid && (!data.showemail || data.showemail === "0"))
							data.emailClass = "";
						else
							data.emailClass = "hide";

						data.show_banned = data.banned === '1' ? '' : 'hide';

						data.uid = uid;
						data.yourid = callerUID;
						data.theirid = uid;
						var badgeImgList = [];
						data.badge_images = null;
						data.show_badges = 'hide';

						user.getFollowingCount(uid, function (followingCount) {
							user.getFollowerCount(uid, function (followerCount) {
								data.followingCount = followingCount;
								data.followerCount = followerCount;
								if (email) {
									badges.getBadges(email, function (err, badges) {
										if (!err && badges && badges.length) {
											for (var i=0; i< badges.length; i++) {
												if (badges[i] && badges[i].badges) {
													var tmpList = badges[i].badges;
													for (var j=0; j<tmpList.length; j++) {
														if (tmpList[j] && tmpList[j].assertion && tmpList[j].assertion.badge) {
															badgeImgList.push({name: tmpList[j].assertion.badge.name,
																			   image: tmpList[j].assertion.badge.image,
																			   description: tmpList[j].assertion.badge.description});
															data.abadge =  tmpList[j].assertion.badge.image;
														}
													}
												}
											}
											if (badgeImgList && badgeImgList.length) {
												data.badge_images = badgeImgList;
												data.show_badges = '';
											}
										}
										callback(data);
									});
								} else {
									callback(data);
								}
							});
						});
					} else {
						callback(null);
					}
				});

			});
		}

	};

}(exports));
