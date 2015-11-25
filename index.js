var request = require("request");
var chrono = require("chrono-node");

var api_endpoint = "";
var slack_token = "";

var time_start = 0;

output = function(event, context, message) {
    var duration = (new Date()).getTime() - time_start;
    if (duration >= 2500) {
        request({
            url: event.response_url,
            method: "POST",
            json: true,
            body: message
        }, function(err, resp, body) {
            if (err) {
                console.log("Failed to post to "+event.response_url);
                console.log(err);
            } else if (resp.statusCode != 200) {
                console.log("Failed to post to "+event.response_url);
                console.log(resp);
                console.log(body);
            }
            context.done();
        });
    } else {
        context.succeed(message);
    }
}

fail_message = function(event, context, message) {
    output(event, context, {text: message});
}

get_user_from_slack = function(event, context, task_body, callback) {
    request({
        url: "https://slack.com/api/users.info?token=" + slack_token + "&user=" + encodeURIComponent(event.user_id)
    }, function(err, resp, body) {
        if (err) {
            console.log("Failed to get user info from slack");
            console.log(err);
            fail_message(event, context, "Oops... something went wrong!");
        } else if (resp.statusCode != 200) {
            console.log("Failed to get user info from slack");
            console.log(resp);
            console.log(body);
            fail_message(event, context, "Oops... something went wrong!");
        } else {
            var user_info = JSON.parse(body);
            task_body.current_user = user_info.user.profile.email;
            callback(task_body);
        }
    });
}

retrieve_owner = function(callback) {
    request({
        url: "https://slack.com/api/users.list?token=" + slack_token
    }, function(err, resp, body) {
        if (err) {
            console.log("Failed to get user list from slack");
            console.log(err);
            fail_message(event, context, "Oops... something went wrong!");
        } else if (resp.statusCode != 200) {
            console.log("Failed to get user list from slack");
            console.log(resp);
            console.log(body);
            fail_message(event, context, "Oops... something went wrong!");
        } else {
            var users_info = JSON.parse(body);
            if (users_info.ok) {
                callback(users_info);
            } else {
                console.log("Failed to get user list from slack");
                console.log(body);
                fail_message(event, context, "Oops... something went wrong!");
            }
        }
    });
}

parse_owner = function(owner, task_body, callback) {
    var email = owner.split("@");
    console.log(email);
    if (email.length > 1 && email[0] != "") {
        task_body.owner = owner;
        callback(task_body.owner);
    } else  if ((email.length > 1 && email[0] == "") || email.length == 1){
        if (email.length > 1) {
            owner = email[1];
        }
        // Slack user
        retrieve_owner(function(users_info) {
            if (users_info.ok) {
                for (var member_index = 0; member_index < users_info.members.length; member_index++) {
                    var member = users_info.members[member_index];
                    if (member.name == owner) {
                        task_body.owner = member.profile.email;
                        break;
                    }
                }
            }

            callback(task_body, users_info);
        });
    }
}

process_task = function(event, context, title, description, finish, estimate, owner, tags, callback,
        error_callback) {
    if (title == null) {
        error_callback("You have to provide a title for the task!");
    } else {
        var task_body = {
            title: title
        };

        if (description != null) {
            task_body.description = description;
        }

        if (finish != null) {
            if (finish.toLowerCase() == "asap") {
                task_body.deadline = (new Date()).getTime();
            } else {
                var finish_date = chrono.parseDate(finish);
                if (finish_date != null) {
                    task_body.deadline = finish_date.getTime();
                }
            }
        }

        if (estimate != null) {
            var tokens = estimate.split(" ");
            if (tokens.length == 2) {
                var unit = tokens[1].toLowerCase();
                var amount = parseInt(tokens[0]);
                if (tokens[0] == "a") {
                    amount = 1;
                }
                if (!isNaN(amount)) {
                    var amount_in_seconds = 0;
                    switch (unit) {
                        case "second":
                        case "seconds":
                            amount_in_seconds = amount;
                            break;
                        case "minute":
                        case "minutes":
                            amount_in_seconds = amount * 60;
                            break;
                        case "hour":
                        case "hours":
                            amount_in_seconds = amount * 3600;
                            break;
                        case "day":
                        case "days":
                            amount_in_seconds = amount * 24 * 3600;
                            break;
                    }
                    task_body.estimate = amount_in_seconds;
                }
            } else {
                var estimate_number = parseInt(estimate);
                if (!isNaN(estimate_number)) {
                    task_body.estimate = estimate_number;
                }
            }
        }

        if (tags != null) {
            task_body.tags = tags.split(" ");
        }

        if (owner != null) {
            parse_owner(owner, task_body, callback, error_callback);
        } else {
            callback(task_body);
        }
    }
}

add = function(event, context, argv) {
    var title = null, description = null, finish = null, estimate = null, owner = null, tags = null, batch = null;
    var has_errors = false;
    for (var arg_index = 1; arg_index < argv.length; arg_index++) {
        switch (argv[arg_index]) {
            case "-t":
            case "--title":
                title = argv[arg_index + 1];
                arg_index++;
                break;
            case "-d":
            case "--description":
                description = argv[arg_index + 1];
                arg_index++;
                break;
            case "-f":
            case "--finish":
                finish = argv[arg_index + 1];
                arg_index++;
                break;
            case "-e":
            case "--estimate":
                estimate = argv[arg_index + 1];
                arg_index++;
                break;
            case "-o":
            case "--owner":
                owner = argv[arg_index + 1];
                arg_index++;
                break;
            case "-g":
            case "--tags":
                tags = argv[arg_index + 1];
                arg_index++;
                break;
            case "-b":
            case "--batch":
                batch = argv[arg_index + 1];
                arg_index++;
                break;
            default:
                has_errors = true;
                fail_message(event, context, "Unrecognized option: \"" + argv[arg_index] + "\"");
                break;
        }
    }

    if (!has_errors) {
        if (batch == null) {
            process_task(event, context, title, description, finish, estimate, owner, tags,
                    function(task_body) {
                        get_user_from_slack(event, context, task_body, function(task_body) {
                            request({
                                url: "/tasks",
                                baseUrl: api_endpoint,
                                method: "POST",
                                json: true,
                                body: task_body
                            }, function(err, resp, body) {
                                if (err) {
                                    console.log("Failed to post to /tasks");
                                    console.log(err);
                                    fail_message(event, context, "Oops... something went wrong!");
                                } else if (resp.statusCode != 200) {
                                    console.log("Failed to post to /tasks");
                                    console.log(resp);
                                    console.log(body);
                                    fail_message(event, context, "Oops... something went wrong!");
                                } else {
                                    console.log(body);
                                    if (body.errorMessage != undefined) {
                                        output(event, context, {text: body.errorMessage});
                                    } else {
                                        output(event, context, {text: "Task " + body._id + " queued!"});
                                    }
                                }
                            });
                        });
                    }, function(error_message) {
                        fail_message(event, context, error_message);
                    });
        } else {
            request(batch, function(err, resp, body) {
                if (err) {
                    console.log("Failed to get URL: " + batch);
                    console.log(err);
                    fail_message(event, context, "Failed to retrieve batch URL!");
                } else if (resp.statusCode != 200) {
                    console.log("Failed to get URL: " + batch);
                    console.log(resp);
                    console.log(body);
                    fail_message(event, context, "Failed to retrieve batch URL!");
                } else {
                    var parts = batch.split("/");
                    var filename = parts[parts.length - 1].split("?")[0];

                    output_results = function(success_result, failure_result) {
                        var result = success_result.length + " tasks added. " + failure_result.length + " tasks failed to add.\n";
                        if (success_result.length > 0) {
                            result += "Successfully added tasks:\n```\n";
                            var max_task_id = 7;
                            var max_title = 5;
                            for (var success_index = 0; success_index < success_result.length; success_index++) {
                                if (max_task_id < success_result[success_index].task_id.toString().length) {
                                    max_task_id = success_result[success_index].task_id.toString().length;
                                }
                                if (max_title < success_result[success_index].title.length) {
                                    max_title = success_result[success_index].title.length;
                                }
                            }
                            if (max_title > 30) {
                                max_title = 30;
                            }

                            var title_border = "+";
                            var title_vert = "|";
                            var task_title = "Task ID";
                            var title_title = "Title";
                            for (var index = 0; index < max_task_id + 2; index++) {
                                title_border += "-";
                                if (index - 1 >= 0 && index - 1 < task_title.length) {
                                    title_vert += task_title[index - 1];
                                } else {
                                    title_vert += " ";
                                }
                            }

                            title_border += "+";
                            title_vert += "|";

                            for (var index = 0; index < max_title + 2; index++) {
                                title_border += "-";
                                if (index - 1 >= 0 && index - 1 < title_title.length) {
                                    title_vert += title_title[index - 1];
                                } else {
                                    title_vert += " ";
                                }
                            }
                            title_vert += "|";
                            title_border += "+";
                            result += title_border + "\n" + title_vert + "\n" + title_border + "\n";

                            for (var success_index = 0; success_index < success_result.length; success_index++) {
                                result += "| ";
                                var task_id = success_result[success_index].task_id.toString();
                                result += task_id;
                                for (var index = 1 + task_id.length; index < max_task_id + 2; index++) {
                                    result += " ";
                                }
                                result += "| ";
                                var title = success_result[success_index].title;
                                if (title.length > 30) {
                                    title = title.substring(0, 27) + "...";
                                }
                                result += title;
                                for (var index = 1 + title.length; index < max_title + 2; index++) {
                                    result += " ";
                                }
                                result += "|\n";
                            }
                            result += title_border + "\n";
                            result += "```\n";
                        }

                        if (failure_result.length > 0) {
                            result += "Failed tasks:\n```\n";
                            var title_border = "+";
                            var title_vert = "|";
                            var task_title = "Line No";
                            var error_title = "Error";

                            var max_task_id = 7;
                            var max_title = 5;
                            for (var failure_index = 0; failure_index < failure_result.length; failure_index++) {
                                if (max_task_id < failure_result[failure_index].line.toString().length) {
                                    max_task_id = failure_result[failure_index].line.toString().length;
                                }
                                if (max_title < failure_result[failure_index].title.length) {
                                    max_title = failure_result[failure_index].title.length;
                                }
                            }

                            for (var index = 0; index < max_task_id + 2; index++) {
                                title_border += "-";
                                if (index - 1 >= 0 && index - 1 < task_title.length) {
                                    title_vert += task_title[index - 1];
                                } else {
                                    title_vert += " ";
                                }
                            }

                            title_border += "+";
                            title_vert += "|";

                            for (var index = 0; index < max_title + 2; index++) {
                                title_border += "-";
                                if (index - 1 >= 0 && index - 1 < title_title.length) {
                                    title_vert += title_title[index - 1];
                                } else {
                                    title_vert += " ";
                                }
                            }
                            title_vert += "|";
                            title_border += "+";
                            result += title_border + "\n" + title_vert + "\n" + title_border + "\n";

                            for (var failure_index = 0; failure_index < failure_result.length; failure_index++) {
                                result += "| ";
                                var task_id = failure_result[failure_index].line.toString();
                                result += task_id;
                                for (var index = 1 + task_id.length; index < max_task_id + 2; index++) {
                                    result += " ";
                                }
                                result += "| ";
                                var title = failure_result[failure_index].error;
                                result += title;
                                for (var index = 1 + title.length; index < max_title + 2; index++) {
                                    result += " ";
                                }
                                result += "|\n";
                            }
                            result += title_border + "\n";

                            result += "```\n";
                        }

                        output(event, context, {response_type: "in_channel", text: result, mrkdwn: true});
                    };

                    var success_result = [];
                    var failure_result = [];

                    var column_map = {
                        title: -1,
                        description: -1,
                        finish: -1,
                        estimate: -1,
                        owner: -1,
                        tags: -1
                    };

                    var lines = body.split("\n");
                    var column_names = lines[0].split(",");
                    for (var column_index = 0; column_index < column_names.length; column_index++) {
                        var column_name = column_names[column_index];
                        if (column_map[column_name] == -1) {
                            column_map[column_name] = column_index;
                        }
                    }

                    var running_queue = 0;
                    for (var line_index = 1; line_index < lines.length; line_index++) {
                        var columns = [];
                        var curr_line = lines[line_index];
                        for (var char_index = 0; char_index < curr_line.length;) {
                            var curr_column = "";
                            var expect_quotes = false;
                            if (curr_line[char_index] == '"') {
                                char_index++;
                                expect_quotes = true;
                            }
                            while ((!expect_quotes && curr_line[char_index] != ",") || (expect_quotes && curr_line[char_index] != '"')) {
                                curr_column += curr_line[char_index];
                                char_index++;
                                if (char_index == curr_line.length) {
                                    break;
                                }
                            }
                            columns.push(curr_column.trim());
                            char_index++;
                            if (expect_quotes) {
                                char_index++;
                            }
                        }

                        running_queue++;
                        (function(columns, line_index) {
                            var task_title = null, task_description = null, task_finish = null, task_estimate = null;
                            var task_owner = null, task_tags = null;
                            if (column_map.title != -1) {
                                task_title = columns[column_map.title];
                            }
                            if (column_map.description != -1) {
                                task_description = columns[column_map.description];
                            }
                            if (column_map.finish != -1) {
                                task_finish = columns[column_map.finish];
                            }
                            if (column_map.estimate != -1) {
                                task_estimate = columns[column_map.estimate];
                            }
                            if (column_map.owner != -1) {
                                task_owner = columns[column_map.owner];
                            }
                            if (column_map.tags != -1) {
                                task_tags = columns[column_map.tags];
                            }
                            if (title != null) {
                                task_title = title;
                            }
                            if (description != null) {
                                task_description = description;
                            }
                            if (finish != null) {
                                task_finish = finish;
                            }
                            if (estimate != null) {
                                task_estimate = estimate;
                            }
                            if (owner != null) {
                                task_owner = owner;
                            }
                            if (tags != null) {
                                task_tags = tags;
                            }

                            if (task_tags == null) {
                                task_tags = "";
                            }
                            if (task_tags != "") {
                                task_tags += "";
                            }
                            task_tags += "addbatch:" + filename;

                            process_task(event, context, task_title, task_description, task_finish, task_estimate,
                                    task_owner, task_tags, function(task_body) {
                                        get_user_from_slack(event, context, task_body, function(task_body) {
                                            request({
                                                url: "/tasks",
                                                baseUrl: api_endpoint,
                                                method: "POST",
                                                json: true,
                                                body: task_body
                                            }, function(err, resp, body) {
                                                running_queue--;
                                                if (err) {
                                                    console.log("Failed to post to /tasks");
                                                    console.log(err);
                                                    failure_result.push({
                                                        line: line_index,
                                                        error: "Failed to connect to task manager API service"
                                                    });
                                                } else if (resp.statusCode != 200) {
                                                    console.log("Failed to post to /tasks");
                                                    console.log(resp);
                                                    console.log(body);
                                                    failure_result.push({
                                                        line: line_index,
                                                        error: "Task manager service returned error"
                                                    });
                                                } else {
                                                    if (body.errorMessage != undefined) {
                                                        failure_result.push({
                                                            line: line_index,
                                                            error: body.errorMessage
                                                        });
                                                    } else {
                                                        success_result.push({
                                                            line: line_index,
                                                            task_id: body._id,
                                                            title: task_title
                                                        });
                                                    }
                                                }

                                                if (running_queue == 0) {
                                                    output_results(success_result, failure_result);
                                                }
                                            });
                                        });
                                    }, function(error_message) {
                                        running_queue--;
                                        failure_result.push({
                                            line: line_index,
                                            error: error_message
                                        });
                                        if (running_queue == 0) {
                                            output_results(success_result, failure_result);
                                        }
                                    });
                        }) (columns, line_index);
                    }
                }
            });
        }
    }
}

update = function(event, context, argv) {
    var title = null, description = null, finish = null, estimate = null, owner = null, tags = null, batch = null;
    var id = null;
    var has_errors = false;
    for (var arg_index = 1; arg_index < argv.length; arg_index++) {
        switch (argv[arg_index]) {
            case "-i":
            case "--id":
                id = argv[arg_index + 1];
                arg_index++;
                break;
            case "-t":
            case "--title":
                title = argv[arg_index + 1];
                arg_index++;
                break;
            case "-d":
            case "--description":
                description = argv[arg_index + 1];
                arg_index++;
                break;
            case "-f":
            case "--finish":
                finish = argv[arg_index + 1];
                arg_index++;
                break;
            case "-e":
            case "--estimate":
                estimate = argv[arg_index + 1];
                arg_index++;
                break;
            case "-o":
            case "--owner":
                owner = argv[arg_index + 1];
                arg_index++;
                break;
            case "-g":
            case "--tags":
                tags = argv[arg_index + 1];
                arg_index++;
                break;
            case "-b":
            case "--batch":
                batch = argv[arg_index + 1];
                arg_index++;
                break;
            default:
                has_errors = true;
                fail_message(event, context, "Unrecognized option: \"" + argv[arg_index] + "\"");
                break;
        }
    }

    if (!has_errors) {
        if (batch == null) {
            process_task(event, context, title, description, finish, estimate, owner, tags,
                    function(task_body) {
                        request({
                            url: "https://slack.com/api/users.info?token=" + slack_token + "&user=" + encodeURIComponent(event.user_id)
                        }, function(err, resp, body) {
                            if (err) {
                                console.log("Failed to get user info from slack");
                                console.log(err);
                                fail_message(event, context, "Oops... something went wrong!");
                            } else if (resp.statusCode != 200) {
                                console.log("Failed to get user info from slack");
                                console.log(resp);
                                console.log(body);
                                fail_message(event, context, "Oops... something went wrong!");
                            } else {
                                var user_info = JSON.parse(body);
                                task_body.current_user = user_info.user.profile.email;
                                request({
                                    url: "/tasks/"+id,
                                    baseUrl: api_endpoint,
                                    method: "PUT",
                                    json: true,
                                    body: task_body
                                }, function(err, resp, body) {
                                    if (err) {
                                        console.log("Failed to post to /tasks");
                                        console.log(err);
                                        fail_message(event, context, "Oops... something went wrong!");
                                    } else if (resp.statusCode != 200) {
                                        console.log("Failed to post to /tasks");
                                        console.log(resp);
                                        console.log(body);
                                        fail_message(event, context, "Oops... something went wrong!");
                                    } else {
                                        console.log(body);
                                        if (body.errorMessage != undefined) {
                                            output(event, context, {text: body.errorMessage});
                                        } else {
                                            output(event, context, {text: "Task " + body._id + " updated!"});
                                        }
                                    }
                                });
                            }
                        });
                    });
        } else {
            request(batch, function(err, resp, body) {
                if (err) {
                    console.log("Failed to get URL: " + batch);
                    console.log(err);
                    fail_message(event, context, "Failed to retrieve batch URL!");
                } else if (resp.statusCode != 200) {
                    console.log("Failed to get URL: " + batch);
                    console.log(resp);
                    console.log(body);
                    fail_message(event, context, "Failed to retrieve batch URL!");
                } else {
                    var parts = batch.split("/");
                    var filename = parts[parts.length - 1].split("?")[0];

                    output_results = function(success_result, failure_result) {
                        var result = success_result.length + " tasks updated successfully. " + failure_result.length + " tasks failed to be updated\n";
                        if (success_result.length > 0) {
                            result += "Successfully updated tasks:\n```\n";
                            var max_task_id = 7;
                            var max_title = 5;
                            for (var success_index = 0; success_index < success_result.length; success_index++) {
                                if (max_task_id < success_result[success_index].task_id.toString().length) {
                                    max_task_id = success_result[success_index].task_id.toString().length;
                                }
                                if (max_title < success_result[success_index].title.length) {
                                    max_title = success_result[success_index].title.length;
                                }
                            }
                            if (max_title > 30) {
                                max_title = 30;
                            }

                            var title_border = "+";
                            var title_vert = "|";
                            var task_title = "Task ID";
                            var title_title = "Title";
                            for (var index = 0; index < max_task_id + 2; index++) {
                                title_border += "-";
                                if (index - 1 >= 0 && index - 1 < task_title.length) {
                                    title_vert += task_title[index - 1];
                                } else {
                                    title_vert += " ";
                                }
                            }

                            title_border += "+";
                            title_vert += "|";

                            for (var index = 0; index < max_title + 2; index++) {
                                title_border += "-";
                                if (index - 1 >= 0 && index - 1 < title_title.length) {
                                    title_vert += title_title[index - 1];
                                } else {
                                    title_vert += " ";
                                }
                            }
                            title_vert += "|";
                            title_border += "+";
                            result += title_border + "\n" + title_vert + "\n" + title_border + "\n";

                            for (var success_index = 0; success_index < success_result.length; success_index++) {
                                result += "| ";
                                var task_id = success_result[success_index].task_id.toString();
                                result += task_id;
                                for (var index = 1 + task_id.length; index < max_task_id + 2; index++) {
                                    result += " ";
                                }
                                result += "| ";
                                var title = success_result[success_index].title;
                                if (title.length > 30) {
                                    title = title.substring(0, 27) + "...";
                                }
                                result += title;
                                for (var index = 1 + title.length; index < max_title + 2; index++) {
                                    result += " ";
                                }
                                result += "|\n";
                            }
                            result += title_border + "\n";
                            result += "```\n";
                        }

                        if (failure_result.length > 0) {
                            result += "Failed tasks:\n```\n";
                            var title_border = "+";
                            var title_vert = "|";
                            var task_title = "Task ID";
                            var title_title = "Title";
                            var error_title = "Error";

                            var max_task_id = 7;
                            var max_title = 5;
                            var max_error = 5;
                            for (var failure_index = 0; failure_index < failure_result.length; failure_index++) {
                                if (max_task_id < failure_result[failure_index].task_id.toString().length) {
                                    max_task_id = failure_result[failure_index].task_id.toString().length;
                                }
                                if (max_title < failure_result[failure_index].title.length) {
                                    max_title = failure_result[failure_index].title.length;
                                }
                                if (max_error < failure_result[failure_index].error.length) {
                                    max_error = failure_result[failure_index].error.length;
                                }
                            }
                            if (max_title > 30) {
                                max_title = 30;
                            }

                            for (var index = 0; index < max_task_id + 2; index++) {
                                title_border += "-";
                                if (index - 1 >= 0 && index - 1 < task_title.length) {
                                    title_vert += task_title[index - 1];
                                } else {
                                    title_vert += " ";
                                }
                            }

                            title_border += "+";
                            title_vert += "|";

                            for (var index = 0; index < max_title + 2; index++) {
                                title_border += "-";
                                if (index - 1 >= 0 && index - 1 < title_title.length) {
                                    title_vert += title_title[index - 1];
                                } else {
                                    title_vert += " ";
                                }
                            }

                            title_vert += "|";
                            title_border += "+";

                            for (var index = 0; index < max_error + 2; index++) {
                                title_border += "-";
                                if (index - 1 >= 0 && index - 1 < error_title.length) {
                                    title_vert += error_title[index - 1];
                                } else {
                                    title_vert += " ";
                                }
                            }
                            title_vert += "|";
                            title_border += "+";

                            result += title_border + "\n" + title_vert + "\n" + title_border + "\n";

                            for (var failure_index = 0; failure_index < failure_result.length; failure_index++) {
                                result += "| ";
                                var task_id = failure_result[failure_index].task_id.toString();
                                result += task_id;
                                for (var index = 1 + task_id.length; index < max_task_id + 2; index++) {
                                    result += " ";
                                }
                                result += "| ";
                                var title = failure_result[failure_index].title;
                                if (title.length > 30) {
                                    title = title.substring(0, 27) + "...";
                                }
                                result += title;
                                for (var index = 1 + title.length; index < max_title + 2; index++) {
                                    result += " ";
                                }
                                result += "| ";
                                var error = failure_result[failure_index].error;
                                result += error;
                                for (var index = 1 + error.length; index < max_error + 2; index++) {
                                    result += " ";
                                }
                                result += "|\n";
                            }
                            result += title_border + "\n";

                            result += "```\n";
                        }

                        output(event, context, {response_type: "in_channel", text: result, mrkdwn: true});
                    };

                    var success_result = [];
                    var failure_result = [];

                    var column_map = {
                        id: -1,
                        title: -1,
                        description: -1,
                        finish: -1,
                        estimate: -1,
                        owner: -1,
                        tags: -1
                    };

                    var lines = body.split("\n");
                    var column_names = lines[0].split(",");
                    for (var column_index = 0; column_index < column_names.length; column_index++) {
                        var column_name = column_names[column_index];
                        if (column_map[column_name] == -1) {
                            column_map[column_name] = column_index;
                        }
                    }

                    var running_queue = 0;
                    for (var line_index = 1; line_index < lines.length; line_index++) {
                        var columns = [];
                        var curr_line = lines[line_index];
                        for (var char_index = 0; char_index < curr_line.length;) {
                            var curr_column = "";
                            var expect_quotes = false;
                            if (curr_line[char_index] == '"') {
                                char_index++;
                                expect_quotes = true;
                            }
                            while ((!expect_quotes && curr_line[char_index] != ",") || (expect_quotes && curr_line[char_index] != '"')) {
                                curr_column += curr_line[char_index];
                                char_index++;
                                if (char_index == curr_line.length) {
                                    break;
                                }
                            }
                            columns.push(curr_column.trim());
                            char_index++;
                            if (expect_quotes) {
                                char_index++;
                            }
                        }

                        running_queue++;
                        (function(columns, line_index) {
                            var task_id = null;
                            var task_title = null, task_description = null, task_finish = null, task_estimate = null;
                            var task_owner = null, task_tags = null;
                            if (column_map.id != -1) {
                                task_id = columns[column_map.id];
                            }
                            if (column_map.title != -1) {
                                task_title = columns[column_map.title];
                            }
                            if (column_map.description != -1) {
                                task_description = columns[column_map.description];
                            }
                            if (column_map.finish != -1) {
                                task_finish = columns[column_map.finish];
                            }
                            if (column_map.estimate != -1) {
                                task_estimate = columns[column_map.estimate];
                            }
                            if (column_map.owner != -1) {
                                task_owner = columns[column_map.owner];
                            }
                            if (column_map.tags != -1) {
                                task_tags = columns[column_map.tags];
                            }
                            if (id != null) {
                                task_id = id;
                            }
                            if (title != null) {
                                task_title = title;
                            }
                            if (description != null) {
                                task_description = description;
                            }
                            if (finish != null) {
                                task_finish = finish;
                            }
                            if (estimate != null) {
                                task_estimate = estimate;
                            }
                            if (owner != null) {
                                task_owner = owner;
                            }
                            if (tags != null) {
                                task_tags = tags;
                            }

                            if (task_tags == null) {
                                task_tags = "";
                            }
                            if (task_tags != "") {
                                task_tags += "";
                            }
                            task_tags += "updatebatch:" + filename;

                            process_task(event, context, task_title, task_description, task_finish, task_estimate,
                                    task_owner, task_tags, function(task_body) {
                                        get_user_from_slack(event, context, task_body, function(task_body) {
                                            request({
                                                url: "/tasks/" + task_id,
                                                baseUrl: api_endpoint,
                                                method: "PUT",
                                                json: true,
                                                body: task_body
                                            }, function(err, resp, body) {
                                                running_queue--;
                                                if (err) {
                                                    console.log("Failed to put to /tasks/" + task_id);
                                                    console.log(err);
                                                    failure_result.push({
                                                        line: line_index,
                                                        error: "Failed to connect to task manager API service"
                                                    });
                                                } else if (resp.statusCode != 200) {
                                                    console.log("Failed to put to /tasks/" + task_id);
                                                    console.log(resp);
                                                    console.log(body);
                                                    failure_result.push({
                                                        line: line_index,
                                                        error: "Task manager service returned error"
                                                    });
                                                } else {
                                                    if (body.errorMessage != undefined) {
                                                        failure_result.push({
                                                            task_id: task_id,
                                                            title: task_title,
                                                            error: body.errorMessage
                                                        });
                                                    } else {
                                                        success_result.push({
                                                            line: line_index,
                                                            task_id: body._id,
                                                            title: task_title
                                                        });
                                                    }
                                                }

                                                if (running_queue == 0) {
                                                    output_results(success_result, failure_result);
                                                }
                                            });
                                        });
                                    }, function(error_message) {
                                        running_queue--;
                                        failure_result.push({
                                            line: line_index,
                                            error: error_message
                                        });
                                        if (running_queue == 0) {
                                            output_results(success_result, failure_result);
                                        }
                                    });
                        }) (columns, line_index);
                    }
                }
            });
        }
    }
}

task_delete = function(event, context, argv) {
    var id = null, batch = null;
    var has_errors = false;
    for (var arg_index = 1; arg_index < argv.length; arg_index++) {
        switch (argv[arg_index]) {
            case "-i":
            case "--id":
                id = argv[arg_index + 1];
                arg_index++;
                break;
            case "-b":
            case "--batch":
                batch = argv[arg_index + 1];
                arg_index++;
                break;
            default:
                has_errors = true;
                fail_message(event, context, "Unrecognized option: \"" + argv[arg_index] + "\"");
                break;
        }
    }

    if (id == null && batch == null) {
        has_errors = true;
        fail_message(event, context, "You must specify a task ID to delete!");
    }

    if (!has_errors) {
        get_user_from_slack(event, context, {}, function(task_body) {
            request({
                url: "/tasks/" + id + "?current_user=" + encodeURIComponent(task_body.current_user),
                baseUrl: api_endpoint,
                method: "DELETE",
                json: true
            }, function(err, resp, body) {
                if (err) {
                    console.log("Failed to delete to /tasks");
                    console.log(err);
                    fail_message(event, context, "Oops... something went wrong!");
                } else if (resp.statusCode != 200) {
                    console.log("Failed to delete to /tasks");
                    console.log(resp);
                    console.log(body);
                    fail_message(event, context, "Oops... something went wrong!");
                } else {
                    console.log(body);
                    if (body && body.errorMessage != undefined) {
                        output(event, context, {text: body.errorMessage});
                    } else {
                        output(event, context, {text: "Task " + id + " deleted!"});
                    }
                }
            });
        });
    }
}

format_task_output = function(task, users_info) {
    for (var member_index = 0; member_index < users_info.members.length; member_index++) {
        var member = users_info.members[member_index];
        if (member.profile.email == task.owner) {
            task.owner = member.name;
            break;
        }
    }
    var result = {
        title: task.title,
        text: task.description,
        fields: [
        {
            title: "Deadline",
            value: task.deadline,
            short: true
        },
        {
            title: "Task ID",
            value: task._id,
            short: true
        },
        {
            title: "Owner",
            value: task.owner,
            short: true
        },
        {
            title: "State",
            value: task.state,
            short: true
        },
        ]
    };

    if (task.estimate != undefined && task.estimate != "") {
        result.fields.push({
            title: "Estimate",
            value: task.estimate,
            short: true
        });
    }

    if (task._worked_by != undefined) {
        for (var member_index = 0; member_index < users_info.members.length; member_index++) {
            var member = users_info.members[member_index];
            if (member.profile.email == task._worked_by) {
                task._worked_by = member.name;
                break;
            }
        }
        result.fields.push({
            title: "Worked by",
            value: task._worked_by,
            short: true
        });
        result.fields.push({
            title: "Worked on",
            value: task._worked_on,
            short: true
        });
        result.fields.push({
            title: "Work Status",
            value: task._work_status,
            short: true
        });

        if (task._completion_status != undefined) {
            result.fields.push({
                title: "Completion Status",
                value: task._completion_status,
                short: true
            });
            result.fields.push({
                title: "Completed On",
                value: task._completed_on,
                short: true
            });
        }
    }

    if (task._tags != undefined && task._tags != "") {
        result.fields.push({
            title: "Tags",
            value: task._tags
        });
    }

    return result;
}

list = function(event, context, argv) {
    var state = null, owner = null, tag = null, num = null, show_long = false, queue = false;
    var has_errors = false;
    for (var arg_index = 1; arg_index < argv.length; arg_index++) {
        switch (argv[arg_index]) {
            case "-s":
            case "--state":
                state = argv[arg_index + 1];
                arg_index++;
                break;
            case "-o":
            case "--owner":
                owner = argv[arg_index + 1];
                arg_index++;
                break;
            case "-g":
            case "--tag":
                tag = argv[arg_index + 1];
                arg_index++;
            case "-n":
            case "--num":
                num = argv[arg_index + 1];
                arg_index++;
                break;
            case "-l":
            case "--long":
                show_long = true;
                break;
            case "-q":
            case "--queue":
                queue = true;
                break;
            default:
                has_errors = true;
                fail_message(event, context, "Unrecognized option: \"" + argv[arg_index] + "\"");
                break;
        }
    }

    post_to_api = function(queries, users_info) {
        var query_string = "";
        if (queries.length > 0) {
            query_string = "?" + queries.join("&");
        }
        request({
            url: "/tasks" + query_string,
            baseUrl: api_endpoint,
            method: "GET",
            json: true
        }, function(err, resp, body) {
            if (err) {
                console.log("Failed to get to /tasks");
                console.log(err);
                fail_message(event, context, "Oops... something went wrong!");
            } else if (resp.statusCode != 200) {
                console.log("Failed to get to /tasks");
                console.log(resp);
                console.log(body);
                fail_message(event, context, "Oops... something went wrong!");
            } else {
                console.log(body);
                if (body.errorMessage != undefined) {
                    output(event, context, {text: body.errorMessage});
                } else {
                    var attachments = [];
                    for (var task_index = 0; task_index < body.length; task_index++) {
                        var task = body[task_index];
                        attachments.push(format_task_output(task, users_info));
                    }
                    output(event, context, {attachments: attachments, response_type: "in_channel"});
                }
            }
        });
    }

    if (!has_errors) {
        var queries = [];
        if (state != null) {
            queries.push("status=" + encodeURIComponent(state));
        }
        if (tag != null) {
            queries.push("tag=" + encodeURIComponent(tag));
        }
        if (num != null) {
            queries.push("n=" + encodeURIComponent(num));
        }
        if (owner != null) {
            parse_owner(owner, {}, function(task_body, users_info) {
                queries.push("owner=" + encodeURIComponent(task_body.owner));
                post_to_api(queries, users_info);
            });
        } else {
            retrieve_owner(function(users_info) {
                post_to_api(queries, users_info);
            });
        }
    }
}

show = function(event, context, argv) {
    var id = null, show_long = false, history = false;
    var has_errors = false;
    for (var arg_index = 1; arg_index < argv.length; arg_index++) {
        switch (argv[arg_index]) {
            case "-i":
            case "--id":
                id = argv[arg_index + 1];
                arg_index++;
                break;
            case "-l":
            case "--long":
                show_long = true;
                break;
            case "-h":
            case "--history":
                history = true;
                break;
            default:
                has_errors = true;
                fail_message(event, context, "Unrecognized option: \"" + argv[arg_index] + "\"");
                break;
        }
    }

    if (!has_errors) {
        if (id == null) {
            fail_message(event, context, "You must specify a task ID to show!");
        } else {
            get_user_from_slack(event, context, {}, function(task_body) {
                request({
                    url: "/tasks/" + id + "?current_user=" + encodeURIComponent(task_body.current_user),
                    baseUrl: api_endpoint,
                    method: "GET",
                    json: true
                }, function(err, resp, body) {
                    if (err) {
                        console.log("Failed to delete to /tasks");
                        console.log(err);
                        fail_message(event, context, "Oops... something went wrong!");
                    } else if (resp.statusCode != 200) {
                        console.log("Failed to delete to /tasks");
                        console.log(resp);
                        console.log(body);
                        fail_message(event, context, "Oops... something went wrong!");
                    } else {
                        console.log(body);
                        if (body.errorMessage != undefined) {
                            output(event, context, {text: body.errorMessage});
                        } else {
                            var task = body;
                            retrieve_owner(function(users_info) {
                                output(event, context, {attachments: [format_task_output(task, users_info)], response_type: "in_channel"});
                            });
                        }
                    }
                });
            });
        }
    }
}

peek = function(event, context, argv) {
    var brief = false, show_long = false;
    var has_errors = false;
    for (var arg_index = 1; arg_index < argv.length; arg_index++) {
        switch (argv[arg_index]) {
            case "-b":
            case "--brief":
                brief = true;
                break;
            case "-l":
            case "--long":
                show_long = true;
                break;
            default:
                has_errors = true;
                fail_message(event, context, "Unrecognized option: \"" + argv[arg_index] + "\"");
                break;
        }
    }

    if (!has_errors) {
        get_user_from_slack(event, context, {}, function(task_body) {
            request({
                url: "/tasks/available?current_user=" + encodeURIComponent(task_body.current_user),
                baseUrl: api_endpoint,
                method: "GET",
                json: true
            }, function(err, resp, body) {
                    if (err) {
                        console.log("Failed to get to /tasks/available");
                        console.log(err);
                        fail_message(event, context, "Oops... something went wrong!");
                    } else if (resp.statusCode != 200) {
                        console.log("Failed to get to /tasks/available");
                        console.log(resp);
                        console.log(body);
                        fail_message(event, context, "Oops... something went wrong!");
                    } else {
                        console.log(body);
                        if (body.errorMessage != undefined) {
                            output(event, context, {text: body.errorMessage});
                        } else {
                            var task = body[0];
                            if (brief) {
                                output(event, context, {text: task._id});
                            } else {
                                retrieve_owner(function(users_info) {
                                    output(event, context, {attachments: [format_task_output(task, users_info)], response_type: "in_channel"});
                                });
                            }
                        }
                    }
            });
        });
    }
}

grab = function(event, context, argv) {
    var task_id = null;
    if (argv.length > 1) {
        task_id = parseInt(argv[1]);
        if (isNaN(task_id)) {
            task_id = null;
        }
    }

    var url = "/workers/tasks";
    if (task_id != null) {
        url += "/" + task_id;
    }

    get_user_from_slack(event, context, {}, function(task_body) {
        var params = {
            url: url,
            baseUrl: api_endpoint,
            method: "POST",
            json: true,
            body: {
                current_user: task_body.current_user
            }
        };
        request(params, function(err, resp, body) {
            console.log(params);
            if (err) {
                console.log("Failed to post to /workers/tasks");
                console.log(err);
                fail_message(event, context, "Oops... something went wrong!");
            } else if (resp.statusCode != 200) {
                console.log("Failed to post to /workers/tasks");
                console.log(resp);
                console.log(body);
                fail_message(event, context, "Oops... something went wrong!");
            } else {
                console.log(body);
                if (body && body.errorMessage != undefined) {
                    output(event, context, {text: body.errorMessage});
                } else {
                    var task = body;
                    retrieve_owner(function(users_info) {
                        output(event, context, {attachments: [format_task_output(task, users_info)], response_type: "in_channel"});
                    });
                }
            }
        });
    });
}

task_status = function(event, context, argv) {
    var task_id = null;
    var new_status = argv[0];
    var has_errors = false;

    if (argv[0] == "done") {
        if (argv.length > 1) {
            if (argv[1] == "success") {
                new_status = "complete-success";
            } else if (argv[1] == "failure") {
                new_status = "complete-failure";
            } else {
                has_errors = true;
                fail_message(event, context, "Unknown completion status");
            }
        } else {
            new_status = "complete-success";
        }
    } else {
        if (argv.length > 1) {
            task_id = parseInt(argv[1]);
            if (isNaN(task_id)) {
                task_id = null;
            }
        }
    }

    if (!has_errors) {
        var url = "/workers/tasks";
        if (task_id != null) {
            url += "/" + task_id;
        }

        get_user_from_slack(event, context, {}, function(task_body) {
            var params = {
                url: url,
                baseUrl: api_endpoint,
                method: "PUT",
                json: true,
                body: {
                    current_user: task_body.current_user,
                    status: new_status
                }
            };
            request(params, function(err, resp, body) {
                if (err) {
                    console.log("Failed to put to /workers/tasks");
                    console.log(err);
                    fail_message(event, context, "Oops... something went wrong!");
                } else if (resp.statusCode != 200) {
                    console.log("Failed to put to /workers/tasks");
                    console.log(resp);
                    console.log(body);
                    fail_message(event, context, "Oops... something went wrong!");
                } else {
                    console.log(body);
                    if (body && body.errorMessage != undefined) {
                        output(event, context, {text: body.errorMessage});
                    } else {
                        output(event, context, {text: body});
                    }
                }
            });
        });
    }
}

exports.handler = function(event, context) {
    time_start = (new Date()).getTime();
    var argv = [];
    if (event.text != "") {
        var curr_arg = "";
        for (var char_index = 0; char_index < event.text.length;) {
            if (event.text[char_index] == " ") {
                if (curr_arg != "") {
                    argv.push(curr_arg);
                    curr_arg = "";
                }
                char_index++;
            } else {
                if (event.text[char_index] == '"') {
                    char_index++;
                    while (event.text[char_index] != '"' && char_index < event.text.length) {
                        if (event.text[char_index] == '\\' && event.text[char_index] == '"') {
                            curr_arg += '"';
                            char_index += 2;
                        } else {
                            curr_arg += event.text[char_index];
                            char_index++;
                        }
                    }
                    // NOTE(yinjun): Consume last '"'
                    char_index++;
                } else if (event.text[char_index] == "'") {
                    char_index++;
                    while (event.text[char_index] != "'" && char_index < event.text.length) {
                        if (event.text[char_index] == '\\' && event.text[char_index] == "'") {
                            curr_arg += "'";
                            char_index += 2;
                        } else {
                            curr_arg += event.text[char_index];
                            char_index++;
                        }
                    }
                    // NOTE(yinjun): Consume last "'"
                    char_index++;
                } else if (event.text[char_index] == "\u201C") {
                    char_index++;
                    while (event.text[char_index] != "\u201D" && char_index < event.text.length) {
                        curr_arg += event.text[char_index];
                        char_index++;
                    }
                    // NOTE(yinjun): Consume last '"'
                    char_index++;
                } else {
                    while (event.text[char_index] != ' ' && char_index < event.text.length) {
                        curr_arg += event.text[char_index];
                        char_index++;
                    }
                }
            }
        }
        if (curr_arg != "") {
            argv.push(curr_arg);
        }
    }

    console.log("Parsed arguments");
    console.log(argv);

    switch (argv[0]) {
        case "add":
            add(event, context, argv);
            break;
        case "update":
            update(event, context, argv);
            break;
        case "delete":
            task_delete(event, context, argv);
            break;
        case "list":
            list(event, context, argv);
            break;
        case "show":
            show(event, context, argv);
            break;
        case "peek":
            peek(event, context, argv);
            break;
        case "grab":
            grab(event, context, argv);
            break;
        case "release":
            task_status(event, context, argv);
            break;
        case "bg":
            task_status(event, context, argv);
            break;
        case "fg":
            task_status(event, context, argv);
            break;
        case "done":
            task_status(event, context, argv);
            break;
    }
}
