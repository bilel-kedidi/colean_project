define(function() {
	var	Users = {};

	Users.init = function() {
		var timeoutId = 0;
		var loadingMoreUsers = false;

		function getActiveSection() {
			var url = window.location.href,
			parts = url.split('/'),
			active = parts[parts.length - 1];
			return active;
		}

		var active = getActiveSection();

		var lastSearch = null;

		app.addCommasToNumbers();

		jQuery('.nav-pills li').removeClass('active');
		jQuery('.nav-pills li a').each(function() {
			if (this.getAttribute('href').match(active)) {
				jQuery(this.parentNode).addClass('active');
				return false;
			}
		});

		jQuery('#search-user').on('keyup', function() {
			if (timeoutId !== 0) {
				clearTimeout(timeoutId);
				timeoutId = 0;
			}

			timeoutId = setTimeout(function() {
				var username = $('#search-user').val();

				if (username == '') {
					jQuery('#user-notfound-notify').html('<i class="fa fa-circle-o"></i>');
					jQuery('#user-notfound-notify').parent().removeClass('btn-warning label-warning btn-success label-success');
					return;
				}

				if (lastSearch === username) return;
				lastSearch = username;

				jQuery('#user-notfound-notify').html('<i class="fa fa-spinner fa-spin"></i>');

				setTimeout(function() {
					socket.emit('api:admin.user.search', username);
				}, 500); //replace this with global throttling function/constant

			}, 250);
		});

		socket.removeAllListeners('api:admin.user.search');

		socket.on('api:admin.user.search', function(data) {
			if (data === null) {
				$('#user-notfound-notify').html('You need to be logged in to search!');
				$('#user-notfound-notify').parent().addClass('btn-warning label-warning');
				return;
			}

			var html = templates.prepare(templates['users'].blocks['users']).parse({
				users: data
			}),
				userListEl = $('#users-container');

			userListEl.html(html);

			if (data && data.length === 0) {
				$('#user-notfound-notify').html('User not found!');
				$('#user-notfound-notify').parent().addClass('btn-warning label-warning');
			} else {
				$('#user-notfound-notify').html(data.length + ' user' + (data.length > 1 ? 's' : '') + ' found!');
				$('#user-notfound-notify').parent().addClass('btn-success label-success');
			}

		});

		socket.on('api:user.isOnline', function(data) {
			if(getActiveSection() == 'online' && !loadingMoreUsers) {
				startLoading('users:online', 0, true);
				socket.emit('api:user.getOnlineAnonCount', {} , function(anonCount) {
					if(parseInt(anonCount, 10) > 0) {
						$('#users-container .anon-user').removeClass('hide');
						$('#online_anon_count').html(anonCount);
					} else {
						$('#users-container .anon-user').addClass('hide');
					}
				});
			}
		});

		function onUsersLoaded(users, emptyContainer) {
			var html = templates.prepare(templates['users'].blocks['users']).parse({
				users: users
			});
			if(emptyContainer)
				$('#users-container .registered-user').remove();
			$('#users-container').append(html);
			$('#users-container .anon-user').appendTo($('#users-container'));
		}

		function loadMoreUsers() {
			var set = '';
			if (active === 'latest' || active === 'users') {
				set = 'users:joindate';
			} else if (active === 'sort-posts') {
				set = 'users:postcount';
			} else if (active === 'sort-reputation') {
				set = 'users:reputation';
			} else if (active === 'online') {
				set = 'users:online';
			}

			if (set) {
				startLoading(set, $('#users-container').children('.registered-user').length);
			}
		}

		function startLoading(set, after, emptyContainer) {
			loadingMoreUsers = true;
			socket.emit('api:users.loadMore', {
				set: set,
				after: after
			}, function(data) {
				if (data.users.length) {
					onUsersLoaded(data.users, emptyContainer);
					$('#load-more-users-btn').removeClass('disabled');
				} else {
					$('#load-more-users-btn').addClass('disabled');
				}
				loadingMoreUsers = false;
			});
		}


		$('#load-more-users-btn').on('click', loadMoreUsers);

		$(window).off('scroll').on('scroll', function() {
			var bottom = ($(document).height() - $(window).height()) * 0.9;

			if ($(window).scrollTop() > bottom && !loadingMoreUsers) {
				loadMoreUsers();
			}
		});
	};

	return Users;
});
