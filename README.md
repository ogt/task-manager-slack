# task-manager-slack
Slack Interface to the task-manager service
```
===============================================================
ez add
===============================================================
USAGE 
ez add -t <title> -d <description> -e <estimate> -f <finish by> -o <owner> -p <priority> -g "funny jenny:urgent" -b <batch file>

SUMMARY
Adds a task with these parameters in the queue
Interface to the https://github.com/ezhome/task-manager POST /tasks web service
Look at that documentation for the meaning of the various attributes
and associated business logic. This man page focus on differences / command line specific
functionality

DESCRIPTION

-t --title    
              # required 
              # sets the title attribue of the task
-d --description
              # optional
              # sets the description attribute of the task
              # if ommited - stays blank
-f --finish : 
              # optional 
              # sets the deadline task attribute 
              # accepts several free form descriptions of datetime 
              # both in terms of interval from now as well as absolute timestamps
              # e.g. "in 5 minutes" "by Monday" "by noon tomorrow" "by end of month" "in 24 hours" "ASAP"
              # the command line handler parses the above and sets the deadline attribute as an absolute timestamp
              # the exact human string provided is not stored anywhere
-e --estimate : 
              # optional
              # sets the estimate attribute
              # accepts several free form descriptions of an interval "5 minutes" "3 hours" "a day"
              # ans sets the estimate in terms of secondds
-o --owner :  
              # optional 
              # Sets the owner attribute
              # accepts @users in slack and  emails when submitted in the Unix command line
              # when using the email convention the @ezhome.com can be ommitted
              # when issued from slack the current user is the currently authenticated slack user
              # when issued from the command line the current user is the currently authenticated aws user??
-p --priority :  
              # optional 
              # Sets the priority attribute
              # accepts any number. It influences the queue order (the order the results show on `list`)
              # higher priority tasks appear first, within the same priority earlier tasks appear first)
              # as a result priority attribute value affect both `peek` and `grab` operation
              # if ommitted it is the same as setting the priority to 0
-g --tags     # optional
              # a single argument of space separated tags
              # sets the tags attribute
-b --batch    
              # optional
              # if provided accepts a csv-file-with-header (file-or-url for Unix, url-only for Slack) that allows a batch of add 
              # commands to be executed in sequence
              # the csv file has header that uses the long form  of the command parameters (e.g. "description" instead of just "d")
              # if a parameter value in a row is missing the ones provided explicitely at the command line would be used
              # if those are missing the command defaults are being used
              # (Unix only) if - is the filename then the command expects the file from the standard input 
              # command auto-guesses if the filename is a url or a filename
              # the command handler always adds a tag "addbatch=filename" that specifies the file used in the batch operation
              # the tag'sfilename used is the last part of the url if a url was used e.g 
              # if url is https://s3-us-west-2.amazonaws.com/task-manager/0853c054f7541ea6f977c932b81851a8.csv then the tag is
              #   addbatch=0853c054f7541ea6f977c932b81851a8.csv

OUTPUT
If this is a single add, for example
`/ez add -t 'email me some positive thoughts. I am feeling down!' -e '5 minutes'  -f 'in 10 minutes'`
the output is
----
Task 5678 Queued! 

  title : 'email me some positive thoughts. I am feeling down!'
  description  :  
  deadline  : '2015-11-20T17:31:33Z'
  estimate : 300
  owner :  'odysseas@ezhome.com'  

  _id : 5768
  _state : 'queued'
  _created_by : 'odysseas@ezhome.com'    
  _created_on : '2015-11-20T17:41:33Z' 
  _last_modified_on : '2015-11-20T17:26:33Z'
  _tags : addbatch:xxxxx
----
If this is a slack issued command we also include a couple convenient links, ie.
instead  of `Task 5678 Queued!`
we display
`Task 5678 Queued!  <Show> <Delete> <List>`

If this is a batch-add the output is 

`NN Tasks queued successfully. MM Tasks failed to be queued`

//After this summary stmt we display the output of 
// list -g "addbatch:batchfile" 
----
Added => 
+--------+------------------------+
|Task ID | Title (first 30 chars) |
+--------+------------------------+
|   xxxxx| Some title             |
|   xxxxx| Some title             |
|   xxxxx| Some title             |
+--------+------------------------+

// and then after that the errors

Errors => 
+------------------------+------------+
| Title (first 30 chars) | Error      |
+------------------------+------------+
| some title             | some error |
| some title             | some error |
| some title             | some error |
+------------------------+------------+
----

===============================================================
ez update
===============================================================

USAGE 
ez update -i 4567 -t <title> -d <description> -e <estimate> -f <finish by> -o <owner> -p <property> -g "funny jenny:urgent" -b <batch file>

SUMMARY
Updates an existing queued task with these parameters.
Interface to the https://github.com/ezhome/task-manager PUT /tasks/xxx web service
Look at that documentation for the meaning of the various attributes
and associated business logic. This man page focus on differences / command line specific
functionality

DESCRIPTION

-i --id       
              # required except if -b option was given
              # corresponds to the _id task attribute
-d --description
-f --finish : 
-e --estimate : 
-p --property :
-o --owner :  
              # see ez add for the description of the fields above
-b --batch    # optional
              # the csv file definition is similar to that of `ez add` with the exception that 
              # the id column has to be present in the file and filled in for each row 
              # also note that we are appending a subsequent updatebatch=xxx for each subsequent batch update
              # to the tags

OUPUT
If this is a single update, for example
`/ez update --id 5678 -t 'email me some positive thoughts. I am feeling down!' -e '5 minutes'  -f 'in 10 minutes'`
the output is
----
Task 5678 Updated! 

  title : 'email me some positive thoughts. I am feeling down!'
  description  :  
  deadline  : '2015-11-20T17:31:33Z'
  estimate : 300
  priority : 0
  owner :  'odysseas@ezhome.com'  

  _id : 5768
  _state : 'queued'
  _created_by : 'odysseas@ezhome.com'    
  _created_on : '2015-11-20T17:41:33Z' 
  _last_modified_on : '2015-11-20T17:26:33Z'
  _tags : addbatch:xxxxx
----
If this is a slack issued command we also include a couple convenient links, ie.
instead  of `Task 5678 Updated!`
we display
`Task 5678 Updated!  <Show> <Delete> <List>`
-----
On error it should display the resulting error message., e.g. 

-----
Cannot Update. Task is already (worked on|completed|deleted)
Task does not exist
-----



If batch 
-----
`NN Tasks updated successfully. MM Tasks failed to be updated`

//After this summary stmt we display the output of 
// list -g "updatebatch:batchfile" 
----
Updated => 
+--------+------------------------+
|Task ID | Title (first 30 chars) |
+--------+------------------------+
|   xxxxx| Some title             |
|   xxxxx| Some title             |
|   xxxxx| Some title             |
+--------+------------------------+

// and then after that the errors

Errors => 
+-------+------------------------+------------+
|     ID| Title (first 30 chars) | Error      |
+-------+------------------------+------------+
|  xxxxx| some title             | some error |
|  xxxxx| some title             | some error |
|  xxxxx| some title             | some error |
+-------+------------------------+------------+

----

===============================================================
ez delete
===============================================================

USAGE 
ez delete -i 4567 
or
ez delete -b <batch file>

SUMMARY
Deletes queued tasks.
Interface to the https://github.com/ezhome/task-manager DELETE /tasks/xxx web service
Look at that documentation for the meaning of the various attributes
and associated business logic. This man page focus on differences / command line specific
functionality

DESCRIPTION

-i --id       
              # required except if -b option was given
              # corresponds to the _id task attribute
-b --batch    # optional
              # the csv file definition is similar to that of `ez update` with the exception that 
              # it only carries an id column 
              # note that we are appending a deletebatch=xxx tag

OUTPUT
If this is a single delete, for example
`/ez delete --id 5678 
the output is
----
Task 5678 Deleted! 

  title : 'email me some positive thoughts. I am feeling down!'
  description  :  
  deadline  : '2015-11-20T17:31:33Z'
  estimate : 300
  priority : 0
  owner :  'odysseas@ezhome.com'  

  _id : 5768
  _state : 'queued'
  _created_by : 'odysseas@ezhome.com'    
  _created_on : '2015-11-20T17:41:33Z' 
  _last_modified_on : '2015-11-20T17:26:33Z'
  _tags : addbatch:xxxxx
----
On error it should display the resulting error message., e.g. 

-----
Cannot Delete. Task is already (worked on|completed|deleted)
Task does not exist
-----


If batch 
-----
`NN Tasks were deleted. MM Tasks failed to be deleted`

//After this summary stmt we display the output of 
// list --deleted -t "deletebatch:batchfile" 

----
Deleted => 
+--------+------------------------+
|Task ID | Title (first 30 chars) |
+--------+------------------------+
|   xxxxx| Some title             |
|   xxxxx| Some title             |
|   xxxxx| Some title             |
+--------+------------------------+

// and then after that the errors

Errors => 
+-------+------------------------+------------+
|     ID| Title (first 30 chars) | Error      |
+-------+------------------------+------------+
|  xxxxx| some title             | some error |
|  xxxxx| some title             | some error |
|  xxxxx| some title             | some error |
+-------+------------------------+------------+

===============================================================
ez list
===============================================================
USAGE
-s --state
              # optional
              # values are "queued" or "worked on" or "deleted" or "completed"
              # tasks that are of state deleted are always excluded 
              # so you can only explicitely list if you set state=deleted
              # this corresponds to GET /tasks?state=xxxx
-o --owner    # optional
              # owner can be any user. In slack form the user is given in @xxxx notation
              # in the unix command line the user is given via email (@ezhome.com can be ommitted)
              # the result listing shows only tasks whose owner is the corresponding user
              # this corresponds to GET /tasks?owner=xxxx
-g --tag      # optional
              # tag can be any tag valie
              # the result listing shows only tasks that contain the exact tag
              # this corresponds to GET /tasks?tag=xxxx
-n --num      # optional - if n missing it defaults to 10 (this should the server default)
              # the result listing is limited to n rows

-l --long 
              # optional
              # if provided it includes in the output  the columns included as part of the `show --long`
              # without the event history
              # otherwise the columns only include the ones that are displayed in the brief form of `show`

-q --queue    # can only by used with '-s queued'. The parameter forces a sorting of the queued tasks
              # in an order that reflects what task should be first : the top of the list should be the 
              # task that should be done first. (It maps to `GET /tasks/available`)



(unfortunately the current API defn requires a web call for each row of the list output)

===============================================================
ez show
===============================================================
USAGE
-l [--long]
               # optional
               # if included produces a longer list of attributes

-h [--history] 
               # optional
               # if included it also includes the event log history associated with the task

OUTPUT

In its brief form displays:
  _id : 5768
  title : 'email me some positive thoughts. I am feeling down!'
  deadline  : '2015-11-20T17:31:33Z'
  priority : 0
  owner :  'odysseas@ezhome.com'
  _state : 'queued'

In its long form it also includes the rest of the attributes

  _id : 5768
  title : 'email me some positive thoughts. I am feeling down!'
  description  :  
  deadline  : '2015-11-20T17:31:33Z'
  priority : 0
  owner :  'odysseas@ezhome.com'
  _state : 'queued'
  estimate : 300
  tags : [ tag1 tag2 ]
  _created_by : 'odysseas@ezhome.com'    
  _created_on : '2015-11-20T17:26:33Z' 
  _last_modified_on : '2015-11-20T17:26:33Z'
  _worked_by : 'mary@ezhome.com'            # if the task is under the control of a worker which worker that is
  _worked_on : '2015-11-20T17:26:33Z'       # if the task is under the control of a worker .. when it was last grabbed */
  _work_status : suspended or active        # if the task is under the control of a worker 
  _completion_status : success or failure   # if the test is completed 
  _completed_on : '2015-11-20T17:26:33Z'    # if the test is completed 

When the event log history is included
+-------------+-----------------------+----------+
| Date Time   |         User          |  Action  | 
+-------------+-----------------------+----------+
| Nov 2 09:23 |   joe@ezhome.com      |    add   |
| Nov 2 09:23 |   joe@ezhome.com      |    add   |
| Nov 2 09:23 |   joe@ezhome.com      |    add   |
| Nov 2 09:23 |   joe@ezhome.com      |    add   |
| Nov 2 09:23 |   joe@ezhome.com      |    add   |
+-------------+-----------------------+----------+


===============================================================
ez peek
===============================================================
SUMMARY
Same as `list -s queued -q -n 1
ie it displays the 

USAGE
-b [--brief]   
               # optional
               # if included echoes just the task id .
               # can be used in conjuction with grab  (grab `peek -b`)
-l [--long]
               # optional
               # if included produces a longer list of attributes

OUTPUT

In its brief form displays:
  _id      : 5768
  title    : 'email me some positive thoughts. I am feeling down!'
  deadline : '2015-11-20T17:31:33Z'
  priority : 0
  owner    :  'odysseas@ezhome.com'
  _state   : 'queued'

In its long form it also includes the rest of the attributes

  _id : 5768
  title : 'email me some positive thoughts. I am feeling down!'
  description  :  
  deadline  : '2015-11-20T17:31:33Z'
  priority : 0
  owner :  'odysseas@ezhome.com'
  _state : 'queued'
  estimate : 300
  tags : [ tag1 tag2 ]
  _created_by : 'odysseas@ezhome.com'    
  _created_on : '2015-11-20T17:26:33Z' 
  _last_modified_on : '2015-11-20T17:26:33Z'
  _worked_by : 'mary@ezhome.com'            # if the task is under the control of a worker which worker that is
  _worked_on : '2015-11-20T17:26:33Z'       # if the task is under the control of a worker .. when it was last grabbed */
  _work_status : suspended or active        # if the task is under the control of a worker 
  _completion_status : success or failure   # if the test is completed 
  _completed_on : '2015-11-20T17:26:33Z'    # if the test is completed 

===============================================================
ez grab [<task_id>]
===============================================================


SUMMARY

(Interface on top of the POST task-managers/workers/xxx/tasks web service)
1. Confirms that the user is logged in (via /login or /sudo)
   If not logged in displays 'You need to /login to perform this command'
   The current logged in user is the xxx worker that is grabbing the task
2. If no task_id, performs a `peek -b` to obtain the first available task in queue
3. If no tasks returns 'Sorry, No Task Available'
   If the task is valid but not in the queue, it returns `Task xxx is not available`
   If this task is not a valid task it rerurns `Task xxx does not exist`
4. If the current user has already an active in progress task, it pushes that active task to the background `bg`
5. It takes the task off the queue, marking it in progress and make it the user's currently active task
6. It logs this event (when,user,grab,taskid)
7. It displays the necessary task detail

DISPLAYS
Displays task info together with some <> links

Task 4567 Grabbed  <release> <done-success> <done-fail>
  _id : 5768
  title : 'email me some positive thoughts. I am feeling down!'
  description  :  
  deadline  : '2015-11-20T17:31:33Z'
  priority : 0
  owner :  'odysseas@ezhome.com'
  estimate : 300
  tags : [ tag1 tag2 ]
  _created_by : 'odysseas@ezhome.com'    
  _created_on : '2015-11-20T17:26:33Z' 
  _last_modified_on : '2015-11-20T17:26:33Z'

Suspended tasks
+ 1567 Task title 1  <fg>
+ 3876 Task Title 2  <fg>

===============================================================
ez done 
===============================================================
USAGE
   done [success] 
   or
   done failure
SUMMARY

(Interface on top of the DELETE task-managers/workers/xxx/tasks/yyy web service)
1. Confirms that the user is logged in (via /login or /sudo)
   If not logged in displays 'You need to /login to perform this command'
   The current logged in user is the xxx worker that is performing the done operation
2. If no active task it displays
   The user has no active tasks. 
3. The currently active task is marked  state=completed and its completion_status is set to 
   success or failure based on the commands argument (no argument means success)
4. If the user has suspended tasks an implicit `fg` is performed bringing the most recently
   suspended task as the currently active task
5. Both done and fg events are being logged
6. The completed task detail is displayed

DISPLAYS
Displays task info together with some <> links

Task 4567 Completed (Success) On Time (or 6:10 hrs late)
Turnaround Time 5 hrs
Total Time In Queue 3hrs
Time Worked On 1hr (estimate 2hrs)

Task History
+-------------+-----------------------+----------+
| Date Time   |         User          |  Action  | 
+-------------+-----------------------+----------+
| Nov 2 09:23 |   joe@ezhome.com      |    add   |
| Nov 2 09:23 |   joe@ezhome.com      |    add   |
| Nov 2 09:23 |   joe@ezhome.com      |    add   |
| Nov 2 09:23 |   joe@ezhome.com      |    add   |
| Nov 2 09:23 |   joe@ezhome.com      |    add   |
+-------------+-----------------------+----------+

Active task
+ 5567 Task title 0  <bg>
Suspended tasks
+ 1567 Task title 1  <fg>
+ 3876 Task Title 2  <fg>


```
