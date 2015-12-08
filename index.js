var request = require("request");
var chrono = require("chrono-node");
var moment = require("moment");

var api_endpoint = "https://xb1dqtlhd0.execute-api.us-west-2.amazonaws.com/v1";
var slack_token = "xoxp-2703963615-14366940084-15161434246-4901f4f02c";

var time_start = 0;

output = function(event, context, message, dont_set_done) {
    var duration = (new Date()).getTime() - time_start;
    if (duration >= 1800 || dont_set_done) {
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
            if (!dont_set_done || dont_set_done == undefined) {
                context.done();
            }
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

process_task = function(event, context, title, description, finish, estimate, owner, tags, priority, callback,
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

        if (priority != null) {
            task_body.priority = priority;
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

add_success_result = function(success_result) {
    var result = "```\n";
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

    return result;
}

parse_csv_line = function(curr_line) {
    var columns = [];

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

    return columns;
}

add = function(event, context, argv) {
    var title = null, description = null, finish = null, estimate = null, owner = null, tags = null, batch = null;
    var priority = null;
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
            case "-p":
            case "--priority":
                priority = argv[arg_index + 1];
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
            process_task(event, context, title, description, finish, estimate, owner, tags, priority,
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
            get_user_from_slack(event, context, task_body, function(task_body) {
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
                            var result = success_result.length + " tasks added. " +
                                failure_result.length + " tasks failed to add.\n";
                            if (success_result.length > 0) {
                                result += "Successfully added tasks:\n";
                                result += add_success_result(success_result);
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
                            tags: -1,
                            priority: -1
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
                            var curr_line = lines[line_index];
                            var columns = parse_csv_line(curr_line);

                            running_queue++;
                            (function(columns, line_index) {
                                var task_title = null, task_description = null, task_finish = null, task_estimate = null;
                                var task_owner = null, task_tags = null, task_priority = null;
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
                                if (column_map.priority != -1) {
                                    task_priority = columns[column_map.priority];
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
                                if (priority != null) {
                                    task_priority = priority;
                                }

                                if (task_tags == null) {
                                    task_tags = "";
                                }
                                if (task_tags != "") {
                                    task_tags += "";
                                }
                                task_tags += "addbatch:" + filename;

                                process_task(event, context, task_title, task_description, task_finish, task_estimate,
                                        task_owner, task_tags, task_priority, function(task_body) {
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
                        if (running_queue == 0) {
                            output_results(success_result, failure_result);
                        }
                    }
                });
            });
        }
    }
}

update = function(event, context, argv) {
    var title = null, description = null, finish = null, estimate = null, owner = null, tags = null, batch = null;
    var id = null, priority = null;
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
            case "-p":
            case "--priority":
                priority = argv[arg_index + 1];
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
            process_task(event, context, title, description, finish, estimate, owner, tags, priority,
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
            get_user_from_slack(event, context, task_body, function(task_body) {
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
                                result += "Successfully updated tasks:\n";
                                result += add_success_result(success_result);
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
                            tags: -1,
                            priority: -1
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
                            var curr_line = lines[line_index];
                            var columns = parse_csv_line(curr_line);

                            running_queue++;
                            (function(columns, line_index) {
                                var task_id = null;
                                var task_title = null, task_description = null, task_finish = null, task_estimate = null;
                                var task_owner = null, task_tags = null, task_priority = null;
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
                                if (column_map.priority != -1) {
                                    task_priority = columns[column_map.priority];
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
                                if (priority != null) {
                                    task_priority = priority;
                                }

                                if (task_tags == null) {
                                    task_tags = "";
                                }
                                if (task_tags != "") {
                                    task_tags += "";
                                }
                                task_tags += "updatebatch:" + filename;

                                process_task(event, context, task_title, task_description, task_finish, task_estimate,
                                        task_owner, task_tags, task_priority, function(task_body) {
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
                        if (running_queue == 0) {
                            output_results(success_result, failure_result);
                        }
                    }
                });
            });
        }
    }
}

task_delete = function(event, context, argv) {
    var id = null, batch = null, tag = null;
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
            case "-g":
            case "--tag":
                tag = argv[arg_index + 1];
                arg_index++;
                break;
            default:
                has_errors = true;
                fail_message(event, context, "Unrecognized option: \"" + argv[arg_index] + "\"");
                break;
        }
    }

    if (id == null && batch == null && tag == null) {
        has_errors = true;
        fail_message(event, context, "You must specify a task ID to delete!");
    }

    output_results = function(success_result, failure_result) {
        var result = success_result.length + " tasks deleted. " + failure_result.length + " tasks weren't deleted\n";
        if (success_result.length > 0) {
            result += "Deleted tasks:\n```\n";
            var title_border = "+";
            var title_vert = "|";
            var task_title = "Task ID";

            var max_task_id = 7;
            for (var success_index = 0; success_index < success_result.length; success_index++) {
                if (max_task_id < success_result[success_index].task_id.toString().length) {
                    max_task_id = success_result[success_index].task_id.toString().length;
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

            result += title_border + "\n" + title_vert + "\n" + title_border + "\n";

            for (var success_index = 0; success_index < success_result.length; success_index++) {
                result += "| ";
                var task_id = success_result[success_index].task_id.toString();
                for (var index = 0; index < (max_task_id - task_id.length); index++) {
                    result += " ";
                }
                result += task_id + " |\n";
            }
            result += title_border + "\n";
            result += "```\n";
        }

        if (failure_result.length > 0) {
            result += "Failed tasks:\n```\n";
            var title_border = "+";
            var title_vert = "|";
            var task_title = "Task ID";
            var error_title = "Error";

            var max_task_id = 7;
            var max_error = 5;
            for (var failure_index = 0; failure_index < failure_result.length; failure_index++) {
                if (max_task_id < failure_result[failure_index].task_id.toString().length) {
                    max_task_id = failure_result[failure_index].task_id.toString().length;
                }
                if (max_error < failure_result[failure_index].error.length) {
                    max_error = failure_result[failure_index].error.length;
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
                for (var index = 0; index < (max_task_id - task_id.length); index++) {
                    result += " ";
                }
                result += task_id;
                result += " | ";
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
    }

    if (!has_errors) {
        if (batch == null && tag == null) {
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
        } else {
            if (tag == null) {
                get_user_from_slack(event, context, {}, function(task_body) {
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


                            var success_result = [];
                            var failure_result = [];

                            var column_map = {
                                id: -1
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
                                var curr_line = lines[line_index];
                                var columns = parse_csv_line(curr_line);

                                running_queue++;
                                (function(columns, line_index) {
                                    var task_id = null;
                                    if (column_map.id != -1) {
                                        task_id = columns[column_map.id];
                                    }
                                    request({
                                        url: "/tasks/" + task_id + "?current_user=" + encodeURIComponent(task_body.current_user) + "&tag=" + encodeURIComponent("deletebatch:" + filename),
                                        baseUrl: api_endpoint,
                                        method: "DELETE",
                                        json: true
                                    }, function(err, resp, body) {
                                        running_queue--;
                                        if (err) {
                                            console.log("Failed to delete to /tasks/"+task_id);
                                            console.log(err);
                                            failure_result.push({
                                                line: line_index,
                                                task_id: task_id,
                                                error: "Failed to connect to task manager API service"
                                            });
                                        } else if (resp.statusCode != 200) {
                                            console.log("Failed to delete to /tasks/"+task_id);
                                            console.log(resp);
                                            console.log(body);
                                            failure_result.push({
                                                line: line_index,
                                                task_id: task_id,
                                                error: "Task manager service returned error"
                                            });
                                        } else {
                                            if (body && body.errorMessage != undefined) {
                                                failure_result.push({
                                                    task_id: task_id,
                                                    line: line_index,
                                                    error: body.errorMessage
                                                });
                                            } else {
                                                success_result.push({
                                                    task_id: task_id,
                                                    line: line_index
                                                });
                                            }
                                        }

                                        if (running_queue == 0) {
                                            output_results(success_result, failure_result);
                                        }
                                    });
                                })(columns, line_index);
                            }
                            if (running_queue == 0) {
                                output_results(success_result, failure_result);
                            }
                        }
                    });
                });
            } else {
                get_user_from_slack(event, context, {}, function(task_body) {
                    request({
                        url: "/tasks?tag=" + encodeURIComponent(tag) + "&n=9999",
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
                            if (body.errorMessage != undefined) {
                                output(event, context, {text: body.errorMessage});
                            } else {
                                var success_result = [];
                                var failure_result = [];
                                var running_queue = 0;

                                if (body.length > 0) {
                                    for (var task_index = 0; task_index < body.length; task_index++) {
                                        running_queue++;
                                        (function(task) {
                                            var task_id = task._id;
                                            request({
                                                url: "/tasks/" + task_id + "?current_user=" + encodeURIComponent(task_body.current_user),
                                                baseUrl: api_endpoint,
                                                method: "DELETE",
                                                json: true
                                            }, function(err, resp, body) {
                                                running_queue--;
                                                if (err) {
                                                    console.log("Failed to delete to /tasks/"+task_id);
                                                    console.log(err);
                                                    failure_result.push({
                                                        line: line_index,
                                                        task_id: task_id,
                                                        error: "Failed to connect to task manager API service"
                                                    });
                                                } else if (resp.statusCode != 200) {
                                                    console.log("Failed to delete to /tasks/"+task_id);
                                                    console.log(resp);
                                                    console.log(body);
                                                    failure_result.push({
                                                        task_id: task_id,
                                                        error: "Task manager service returned error"
                                                    });
                                                } else {
                                                    if (body && body.errorMessage != undefined) {
                                                        failure_result.push({
                                                            task_id: task_id,
                                                            error: body.errorMessage
                                                        });
                                                    } else {
                                                        success_result.push({
                                                            task_id: task_id,
                                                        });
                                                    }
                                                }

                                                if (running_queue == 0) {
                                                    output_results(success_result, failure_result);
                                                }
                                            });
                                        })(body[task_index]);
                                    }
                                }
                                if (running_queue == 0) {
                                    output_results(success_result, failure_result);
                                }
                            }
                        }
                    });
                });
            }
        }
    }
}

format_task_output = function(task, users_info, show_long) {
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
            title: "Priority",
            value: task.priority,
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

    if (show_long) {
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
    }

    return result;
}

jobs = function(event, context, argv) {
    var owner = argv[1];
    if (owner != undefined) {
        parse_owner(owner, {}, function(task_body, users_info) {
            request({
                url: "/workers/" + encodeURIComponent(task_body.owner) + "/tasks",
                baseUrl: api_endpoint,
                method: "GET",
                json: true
            }, function(err, resp, body) {
                console.log("/workers/" + encodeURIComponent(task_body.owner) + "/tasks")
                if (err) {
                    console.log("Failed to get to /workers/"+task_body.owner+"/tasks");
                    console.log(err);
                    fail_message(event, context, "Oops... something went wrong!");
                } else if (resp.statusCode != 200) {
                    console.log("Failed to get to /workers/"+task_body.owner+"/tasks");
                    console.log(resp);
                    console.log(body);
                    fail_message(event, context, "Oops... something went wrong!");
                } else {
                    if (body && body.errorMessage != undefined) {
                        output(event, context, {text: body.errorMessage});
                    } else {
                        var text = "Tasks this user grabbed:\n";
                        console.log(body);
                        if (body.length > 0) {
                            var user_email_map = {};
                            for (var member_index = 0; member_index < users_info.members.length; member_index++) {
                                var member = users_info.members[member_index];
                                user_email_map[member.profile.email] = member.name;
                            }
                            var task_statuses = {};
                            for (var task_index = 0; task_index < body.length; task_index++) {
                                var task = body[task_index];
                                if (task_statuses[task._work_status] == undefined) {
                                    task_statuses[task._work_status] = [];
                                }
                                task_statuses[task._work_status].push("• [" + task._id + "] Do \"" + task.title + "\" by " + moment(task.deadline).format("h:mm a dddd, MMMM YYYY") + ", " + task._work_status);
                            }
                            for (var state in task_statuses) {
                                if (task_statuses.hasOwnProperty(state)) {
                                    text += state + ":\n";
                                    text += task_statuses[state].join("\n");
                                    text += "\n";
                                }
                            } 
                        } else {
                            text = "No tasks grabbed!!";
                        }
                        output(event, context, {text: text, mrkdwn: true});
                    }
                }
            });
        });
    } else {
        fail_message(event, context, "You must specify a user!");
    }
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

    post_to_api = function(queries, users_info, queue) {
        var query_string = "";
        if (queries.length > 0) {
            query_string = "?" + queries.join("&");
        }
        var url = "/tasks";
        if (queue) {
            url += "/available";
        }
        request({
            url: url + query_string,
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
                    if (show_long) {
                        var attachments = [];
                        for (var task_index = 0; task_index < body.length; task_index++) {
                            var task = body[task_index];
                            attachments.push(format_task_output(task, users_info, show_long));
                        }
                        output(event, context, {attachments: attachments, response_type: "in_channel"});
                    } else {
                        var text = "";
                        if (body.length > 0) {
                            var user_email_map = {};
                            for (var member_index = 0; member_index < users_info.members.length; member_index++) {
                                var member = users_info.members[member_index];
                                user_email_map[member.profile.email] = member.name;
                            }
                            var task_statuses = {};
                            for (var task_index = 0; task_index < body.length; task_index++) {
                                var task = body[task_index];
                                if (task_statuses[task.state] == undefined) {
                                    task_statuses[task.state] = [];
                                }
                                task_statuses[task.state].push("• [" + task._id + "] Do \"" + task.title + "\" priority " + task.priority + ", owned by " + user_email_map[task.owner]);
                            }
                            for (var state in task_statuses) {
                                if (task_statuses.hasOwnProperty(state)) {
                                    text += state + ":\n";
                                    text += task_statuses[state].join("\n");
                                    text += "\n";
                                }
                            } 
                        } else {
                            text = "There's no tasks!!";
                        }
                        output(event, context, {text: text, mrkdwn: true});
                    }
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
                post_to_api(queries, users_info, queue);
            });
        } else {
            retrieve_owner(function(users_info) {
                post_to_api(queries, users_info, queue);
            });
        }
    }
}

show = function(event, context, argv) {
    // TODO: Implement history
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
                                output(event, context, {
                                    attachments: [format_task_output(task, users_info, show_long)],
                                    response_type: "in_channel"
                                }, history);
                                if (history) {
                                    request({
                                        url: "/tasks/" + id + "/history?current_user=" + encodeURIComponent(task_body.current_user),
                                        baseUrl: api_endpoint,
                                        method: "GET",
                                        json: true
                                    }, function(err, resp, body) {
                                        if (err) {
                                            console.log("Failed to retrieve history");
                                            console.log(err);
                                            fail_message(event, context, "Oops... something went wrong!");
                                        } else if (resp.statusCode != 200) {
                                            console.log("Failed to retrieve history");
                                            console.log(resp);
                                            console.log(body);
                                            fail_message(event, context, "Oops... something went wrong!");
                                        } else {
                                            retrieve_owner(function(users_info) {
                                                var users_list = {};
                                                for (var member_index = 0; member_index < users_info.members.length; member_index++) {
                                                    var member = users_info.members[member_index];
                                                    users_list[member.profile.email] = member.name;
                                                }

                                                var events = body.events;

                                                var result = "History:\n```\n";

                                                var title_border = "+";
                                                var title_vert = "|";
                                                var date_title = "Date";
                                                var user_title = "User";
                                                var action_title = "Action";

                                                var max_date = 4;
                                                var max_user = 4;
                                                var max_action = 6;
                                                for (var event_index = 0; event_index < events.length; event_index++) {
                                                    if (max_date < events[event_index].when.length) {
                                                        max_date = events[event_index].when.length;
                                                    }
                                                    events[event_index].who = users_list[events[event_index].who];
                                                    if (max_user < events[event_index].who.length) {
                                                        max_user = events[event_index].who.length;
                                                    }
                                                    if (max_action < events[event_index].what.length) {
                                                        max_action = events[event_index].what.length;
                                                    }
                                                }

                                                for (var index = 0; index < max_date + 2; index++) {
                                                    title_border += "-";
                                                    if (index - 1 >= 0 && index -1 < date_title.length) {
                                                        title_vert += date_title[index - 1];
                                                    } else {
                                                        title_vert += " ";
                                                    }
                                                }

                                                title_border += "+";
                                                title_vert += "|";

                                                for (var index = 0; index < max_user + 2; index++) {
                                                    title_border += "-";
                                                    if (index - 1 >= 0 && index -1 < user_title.length) {
                                                        title_vert += user_title[index - 1];
                                                    } else {
                                                        title_vert += " ";
                                                    }
                                                }

                                                title_border += "+";
                                                title_vert += "|";

                                                for (var index = 0; index < max_action + 2; index++) {
                                                    title_border += "-";
                                                    if (index - 1 >= 0 && index -1 < action_title.length) {
                                                        title_vert += action_title[index - 1];
                                                    } else {
                                                        title_vert += " ";
                                                    }
                                                }

                                                title_border += "+";
                                                title_vert += "|";

                                                result += title_border + "\n" + title_vert + "\n" + title_border + "\n";

                                                for (var event_index = 0; event_index < events.length; event_index++) {
                                                    result += "| ";
                                                    var date = events[event_index].when;
                                                    result += date;
                                                    for (var index = 1 + date.length; index < max_date + 2; index++) {
                                                        result += " ";
                                                    }
                                                    result += "| ";
                                                    var who = events[event_index].who;
                                                    result += who;
                                                    for (var index = 1 + who.length; index < max_user + 2; index++) {
                                                        result += " ";
                                                    }
                                                    result += "| ";
                                                    var what = events[event_index].what;
                                                    result += what;
                                                    for (var index = 1 + what.length; index < max_action + 2; index++) {
                                                        result += " ";
                                                    }
                                                    result += "|\n";
                                                }

                                                result += title_border + "\n";
                                                result += "```\n";

                                                output(event, context, {response_type: "in_channel", text: result, mrkdwn: true});
                                            });
                                        }
                                    });
                                }
                            });
                        }
                    }
                });
            });
        }
    }
}

last = function(event, context, argv) {
    var user = argv[1];

    retrieve_last = function(user) {
        request({
            url: "/events?user=" + encodeURIComponent(user) + "&type=loginout",
            baseUrl: api_endpoint,
            method: "GET",
            json: true
        }, function(err, resp, body) {
            if (err) {
                console.log("Failed to get to /events");
                console.log(err);
                fail_message(event, context, "Oops... something went wrong!");
            } else if (resp.statusCode != 200) {
                console.log("Failed to get to /events");
                console.log(resp);
                console.log(body);
                fail_message(event, context, "Oops... something went wrong!");
            } else {
                if (body && body.errorMessage != undefined) {
                    output(event, context, {text: body.errorMessage});
                } else {
                    var response = "";
                    if (body.length > 0) {
                        for (var item_index = 0; item_index < body.length; item_index++) {
                            var action = "Login";
                            if (body[item_index].action == "logout") {
                                action = "Logout";
                            }
                            response += "• " + moment(body[item_index].date).format("h:mm a dddd, MMMM YYYY") + ", " + action + "\n";
                        }
                    }
                    output(event, context, {text: response, mrkdwn: true});
                }
            }
        });
    };

    if (user == undefined) {
        get_user_from_slack(event, context, {}, function(task_body) {
            retrieve_last(task_body.current_user);
        });
    } else {
        parse_owner(user, {}, function(task_body, users_info) {
            retrieve_last(task_body.owner);
        });
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
                                output(event, context, {
                                    attachments: [format_task_output(task, users_info, show_long)],
                                    response_type: "in_channel"
                                });
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
                    if (body.text != undefined) {
                        output(event, context, body);
                    } else {
                        retrieve_owner(function(users_info) {
                            output(event, context, {
                                attachments: [format_task_output(task, users_info, true)],
                                response_type: "in_channel"
                            });
                        });
                    }
                }
            }
        });
    });
}

purge = function(event, context, argv) {
    var id = null, state = null, owner = null, tag = null;
    var has_errors = false;
    for (var arg_index = 1; arg_index < argv.length; arg_index++) {
        switch (argv[arg_index]) {
            case "-i":
            case "--id":
                id = argv[arg_index + 1];
                arg_index++;
                break;
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
                break;
            default:
                has_errors = true;
                fail_message(event, context, "Unrecognized option: \"" + argv[arg_index] + "\"");
                break;
        }
    }

    if (id == null && owner == null) {
        has_errors = true;
        fail_message(event, context, "You must specify a task ID to purge!");
    }

    output_results = function(success_result, failure_result) {
        var result = success_result.length + " tasks purged. " + failure_result.length + " tasks weren't purged\n";
        if (success_result.length > 0) {
            result += "Deleted tasks:\n```\n";
            var title_border = "+";
            var title_vert = "|";
            var task_title = "Task ID";

            var max_task_id = 7;
            for (var success_index = 0; success_index < success_result.length; success_index++) {
                if (max_task_id < success_result[success_index].task_id.toString().length) {
                    max_task_id = success_result[success_index].task_id.toString().length;
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

            result += title_border + "\n" + title_vert + "\n" + title_border + "\n";

            for (var success_index = 0; success_index < success_result.length; success_index++) {
                result += "| ";
                var task_id = success_result[success_index].task_id.toString();
                for (var index = 0; index < (max_task_id - task_id.length); index++) {
                    result += " ";
                }
                result += task_id + " |\n";
            }
            result += title_border + "\n";
            result += "```\n";
        }

        if (failure_result.length > 0) {
            result += "Failed tasks:\n```\n";
            var title_border = "+";
            var title_vert = "|";
            var task_title = "Task ID";
            var error_title = "Error";

            var max_task_id = 7;
            var max_error = 5;
            for (var failure_index = 0; failure_index < failure_result.length; failure_index++) {
                if (max_task_id < failure_result[failure_index].task_id.toString().length) {
                    max_task_id = failure_result[failure_index].task_id.toString().length;
                }
                if (max_error < failure_result[failure_index].error.length) {
                    max_error = failure_result[failure_index].error.length;
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
                for (var index = 0; index < (max_task_id - task_id.length); index++) {
                    result += " ";
                }
                result += task_id;
                result += " | ";
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
    }

    if (!has_errors) {
        if (id != null) {
            get_user_from_slack(event, context, {}, function(task_body) {
                request({
                    url: "/tasks/" + id + "/purge",
                    baseUrl: api_endpoint,
                    method: "POST",
                    json: true,
                    body: {
                        current_user: task_body.current_user
                    }
                }, function(err, resp, body) {
                    if (err) {
                        console.log("Failed to post to /tasks/"+id+"/purge");
                        console.log(err);
                        fail_message(event, context, "Oops... something went wrong!");
                    } else if (resp.statusCode != 200) {
                        console.log("Failed to post to /tasks/"+id+"/purge");
                        console.log(resp);
                        console.log(body);
                        fail_message(event, context, "Oops... something went wrong!");
                    } else {
                        console.log(body);
                        if (body && body.errorMessage != undefined) {
                            output(event, context, {text: body.errorMessage});
                        } else {
                            output(event, context, {text: "Task " + id + " purged!"});
                        }
                    }
                });
            });
        } else {
            get_user_from_slack(event, context, {}, function(task_body) {
                var current_user = task_body.current_user;
                var queries = [];
                var success_result = [], failure_result = [];
                var running_queue = 0;

                post_to_api = function(queries, is_final) {
                    var query_string = "?" + queries.join("&");
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
                            if (body.errorMessage != undefined) {
                                output(event, context, {text: body.errorMessage});
                            } else {
                                if (body.length > 0) {
                                    for (var task_index = 0; task_index < body.length; task_index++) {
                                        running_queue++;
                                        (function(task) {
                                            var id = task._id;
                                            request({
                                                url: "/tasks/" + id + "/purge",
                                                baseUrl: api_endpoint,
                                                method: "POST",
                                                json: true,
                                                body: {
                                                    current_user: current_user
                                                }
                                            }, function(err, resp, body) {
                                                running_queue--;
                                                if (err) {
                                                    console.log("Failed to post to /tasks/"+id+"/purge");
                                                    console.log(err);
                                                    failure_result.push({
                                                        task_id: id,
                                                        error: "Failed to connect to task manager API service"
                                                    });
                                                } else if (resp.statusCode != 200) {
                                                    console.log("Failed to post to /tasks/"+id+"/purge");
                                                    console.log(resp);
                                                    console.log(body);
                                                    failure_result.push({
                                                        task_id: id,
                                                        error: "Task manager service returned error"
                                                    });
                                                } else {
                                                    if (body && body.errorMessage != undefined) {
                                                        failure_result.push({
                                                            task_id: id,
                                                            error: body.errorMessage
                                                        });
                                                    } else {
                                                        success_result.push({
                                                            task_id: id,
                                                        });
                                                    }
                                                }

                                                if (running_queue == 0 && is_final) {
                                                    output_results(success_result, failure_result);
                                                }
                                            });
                                        })(body[task_index]);
                                    }
                                }

                                if (running_queue == 0 && is_final) {
                                    output_results(success_result, failure_result);
                                }
                            }
                        }

                    });
                }

                parse_owner(owner, {}, function(task_body, users_info) {
                    queries.push("owner=" + encodeURIComponent(task_body.owner));
                    if (tag != null) {
                        queries.push("tag=" + encodeURIComponent(tag));
                    }
                    if (state == null) {
                        queries.push("status=completed");
                        post_to_api(queries, false);
                        queries.pop();
                        queries.push("status=deleted");
                        post_to_api(queries, true);
                    } else {
                        queries.push("status=" + encodeURIComponent(state));
                        post_to_api(queries, true);
                    }
                });
            });
        }
    }
}

finger = function(event, context, argv) {
    var user = argv[1];

    if (user == undefined) {
        fail_message(event, context, "You must specify a user");
    } else {
        parse_owner(user, {}, function(task_body, users_info) {
            request({
                url: "/workers/" + task_body.owner + "/stats",
                baseUrl: api_endpoint,
                method: "GET",
                json: true
            }, function(err, resp, body) {
                if (err) {
                    console.log("Failed to get to /workers/"+task_body.owner+"/stats");
                    console.log(err);
                    fail_message(event, context, "Oops... something went wrong!");
                } else if (resp.statusCode != 200) {
                    console.log("Failed to get to /workers/"+task_body.owner+"/stats");
                    console.log(resp);
                    console.log(body);
                    fail_message(event, context, "Oops... something went wrong!");
                } else {
                    console.log(body);
                    if (body.errorMessage != undefined) {
                        output(event, context, {text: body.errorMessage});
                    } else {
                        var avg_session_length = moment.duration(body.avg_session_length / 1000).humanize();
                        output(event, context, {
                            mrkdwn: true,
                            text: "Statistics for " + user + ":\n" +
                                "• Average session length: " + avg_session_length + "\n" +
                                "• Number of sessions: " + body.num_of_sessions + "\n" +
                                "• Tasks grabbed: " + body.tasks_grabbed + "\n" +
                                "• Tasks completed: " + body.tasks_completed + "\n" +
                                "• Tasks completed successfully: " + body.tasks_completed_successfully + "\n" +
                                "• Rejection ratio: " + body.rejection_ratio + "\n" +
                                "• Failure ratio: " + body.failure_ratio
                        });
                    }
                }
            });
        });
    }
}

login = function(event, context, argv) {
    get_user_from_slack(event, context, {}, function(task_body) {
        request({
            url: "/workers",
            baseUrl: api_endpoint,
            method: "POST",
            json: true,
            body: {"email": task_body.current_user}
        }, function(err, resp, body) {
            if (err) {
                console.log("Failed to post to /workers");
                console.log(err);
                fail_message(event, context, "Oops... something went wrong!");
            } else if (resp.statusCode != 200) {
                console.log("Failed to post to /workers");
                console.log(resp);
                console.log(body);
                fail_message(event, context, "Oops... something went wrong!");
            } else {
                console.log(body);
                if (body && body.errorMessage != undefined) {
                    output(event, context, {text: body.errorMessage});
                } else {
                    if (body.token != undefined) {
                        output(event, context, {text: "Logged in successfully!"});
                    }
                }
            }
        });
    });
}

who = function(event, context, argv) {
    request({
        url: "/workers",
        baseUrl: api_endpoint,
        method: "GET",
        json: true
    }, function(err, resp, body) {
        if (err) {
            console.log("Failed to get to /workers");
            console.log(err);
            fail_message(event, context, "Oops... something went wrong!");
        } else if (resp.statusCode != 200) {
            console.log("Failed to post to /workers");
            console.log(resp);
            console.log(body);
        } else {
            if (body && body.errorMessage != undefined) {
                output(event, context, {text: body.errorMessage});
            } else {
                if (body.length > 0) {
                    retrieve_owner(function(users_info) {
                        var result = "Logged in users:\n";
                        var users_lookup = {};
                        for (var member_index = 0; member_index < users_info.members.length; member_index++) {
                            var member = users_info.members[member_index];
                            users_lookup[member.profile.email] = member.name;
                        }
                        for (var item_index = 0; item_index < body.length; item_index++) {
                            var user = body[item_index];
                            if (user["status"] == "loggedin") {
                                result += "• " + users_lookup[user.userid] + ", logged in on " + moment(user.loggedin_on).format("h:mm a dddd, MMMM YYYY") + "\n";
                            }
                        }
                        output(event, context, {text: result, mrkdwn: true});
                    });
                } else {
                    output(event, context, {text: "Currently no logged in users"});
                }
            }
        }
    });
}

sudo = function(event, context, argv) {
    var user = argv[1];

    if (user) {
        parse_owner(user, {}, function(task_body, users_info) {
            var target_user = task_body.owner;
            var current_user = event.user_id;
            for (var member_index = 0; member_index < users_info.members.length; member_index++) {
                var member = users_info.members[member_index];
                if (member.id == event.user_id) {
                    current_user = member.profile.email;
                    break;
                }
            }
            request({
                url: "/workers/" + encodeURIComponent(target_user) + "/assume",
                baseUrl: api_endpoint,
                method: "POST",
                json: true,
                body: {"current_user": current_user}
            }, function(err, resp, body) {
                if (err) {
                    console.log("Failed to post to /workers");
                    console.log(err);
                    fail_message(event, context, "Oops... something went wrong!");
                } else if (resp.statusCode != 200) {
                    console.log("Failed to post to /workers");
                    console.log(resp);
                    console.log(body);
                    fail_message(event, context, "Oops... something went wrong!");
                } else {
                    console.log(body);
                    if (body && body.errorMessage != undefined) {
                        output(event, context, {text: body.errorMessage});
                    } else {
                        if (body == true) {
                            output(event, context, {text: "You are now " + user});
                        } else {
                            console.log(body);
                            if (body.text != undefined) {
                                output(event, context, {text: body.text});
                            } else {
                                output(event, context, {text: "Something went wrong!"});
                            }
                        }
                    }
                }
            });
        });
    } else {
        output(event, context, {text: "You have to input a user!"});
    }
}

logout = function(event, context, argv) {
    get_user_from_slack(event, context, {}, function(task_body) {
        request({
            url: "/workers?current_user=" + encodeURIComponent(task_body.current_user),
            baseUrl: api_endpoint,
            method: "DELETE",
            json: true
        }, function(err, resp, body) {
            if (err) {
                console.log("Failed to delete to /workers");
                console.log(err);
                fail_message(event, context, "Oops... something went wrong!");
            } else if (resp.statusCode != 200) {
                console.log("Failed to delete to /workers");
                console.log(resp);
                console.log(body);
                fail_message(event, context, "Oops... something went wrong!");
            } else {
                console.log(body);
                if (body && body.errorMessage != undefined) {
                    output(event, context, {text: body.errorMessage});
                } else {
                    output(event, context, {text: "Logged out successfully!"});
                }
            }
        });
    });
}

task_status = function(event, context, argv) {
    var task_id = null;
    var new_status = argv[0];
    var has_errors = false;
    var is_done = false;

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
        is_done = true;
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
                        // TODO: Output detailed stats for done
                        output(event, context, {text: body});
                    }
                }
            });
        });
    }
}

exports.handler = function(event, context) {
    if (event.channel_name != undefined) {
        if (event.channel_name == 'auto-signups' && event.bot_name == 'bookingbot') {
            var parts = event.text.split('*');
            var customer_name = parts[1].replace('&lt;', '<').replace('&gt;', '>');
            var address = parts[3];
            process_task(event, context, "CAD task: " + customer_name + " (" + address + ")",
                    "Go and claim this house at https://my.ezhome.com/admin/blueprints_queue/",
                    null, null, "joana", "cad:auto-signups", 100, function(task_body) {
                        task_body.current_user = "joana@ezhome.io";
                        request({
                            url: "/tasks",
                            baseUrl: api_endpoint,
                            method: "POST",
                            json: true,
                            body: task_body
                        }, function(err, resp, body) {
                            if (err) {
                                console.log(err);
                            } else if (resp.statusCode != 200) {
                                console.log(resp);
                                console.log(body);
                            } else {
                                console.log("Task added from auto-signups!");
                            }
                            context.done();
                        });
                    }, function(error_message) {
                        console.log(error_message);
                        context.done();
                    });
        } else if (event.channel_name == 'auto-close' && event.bot_name == 'bookingbot') {
            var parts = event.text.split('*');
            var customer_name = parts[1];
            var address = parts[3];
            process_task(event, context, "Central repo task: " + customer_name + " (" + address + ")",
                    null, null, null, "jenny", "central-repo:auto-close", 20, function(task_body) {
                        task_body.current_user = "jenny@ezhome.com";
                        request({
                            url: "/tasks",
                            baseUrl: api_endpoint,
                            method: "POST",
                            json: true,
                            body: task_body
                        }, function(err, resp, body) {
                            if (err) {
                                console.log(err);
                            } else if (resp.statusCode != 200) {
                                console.log(resp);
                                console.log(body);
                            } else {
                                console.log("Task added from auto-close!");
                            }
                            context.done();
                        });
                    });
        }
    } else {
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
                        // NOTE(yinjun): There's a weird case here when it's opened with \u201D but then
                        // if the quote is the last character of the string, it will be ended with the
                        // normal ascii " character, and since we want to support the case where users
                        // accidentally try to escape the " characters within the quotes, some weird
                        // edge case handling is done.
                        while (event.text[char_index] != "\u201D" && char_index < event.text.length) {
                            if (event.text[char_index] == '"' && event.text[char_index-1] != '\\' &&
                                    char_index == event.text.length - 1) {
                                char_index++;
                            } else if (event.text[char_index] == '\\' && event.text[char_index] == '"') {
                                curr_arg += '"';
                                char_index += 2;
                            } else {
                                curr_arg += event.text[char_index];
                                char_index++;
                            }
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

        console.log(event.text);
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
            case "purge":
                purge(event, context, argv);
                break;
            case "finger":
                finger(event, context, argv);
                break;
            case "start":
                login(event, context, argv);
                break;
            case "finish":
                logout(event, context, argv);
                break;
            case "last":
                last(event, context, argv);
                break;
            case "jobs":
                jobs(event, context, argv);
                break;
            case "sudo":
                sudo(event, context, argv);
                break;
            case "who":
                who(event, context, argv);
                break;
            case "man":
                output(event, context, {
                    text: "```\nadd      - Adds task(s) in the queue\n" +
                        "update   - Update existing task - only possible while the task sits\n" +
                        "delete   - Deletes task(s) from the queue\n" +
                        "finger   - Shows info about a particular user\n" +
                        "list     - Lists all tasks in the queue\n" +
                        "jobs     - List all the tasks that the user has grabbed (current and suspended)\n" +
                        "last     - Log of logins and logouts\n" +
                        "show     - Shows info and stats about a specific task\n" +
                        "start    - Begins a new session\n" +
                        "finish   - Ends the current session\n" +
                        "peek     - Shows you the next task that should be grabbed\n" +
                        "grab     - Take a task from the queue, making it the current task. If you were already working on a task suspend it\n" +
                        "release  - Puts task back to the queue without doing it\n" +
                        "bg       - Suspends a currently active task\n" +
                        "fg       - Activates a suspended task\n" +
                        "sudo     - Assume the identity of a logged in user\n" +
                        "done     - Mark the current task as completed\n" +
                        "purge    - Completely removes deleted or completed task\n" +
                        "man      - Shows this page\n```\n",
                    mrkdwn: true
                });
                break;
        }
    }
}
