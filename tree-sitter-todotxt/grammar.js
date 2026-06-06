module.exports = grammar({
  name: "todotxt",

  extras: $ => [
    /[ \t]/,
  ],

  rules: {
    source_file: $ => repeat(choice(
      $.task,
      $._newline,
    )),

    task: $ => prec.right(seq(
      choice(
        seq(
          choice(
            $.completed_task_prefix,
            $.active_task_prefix,
          ),
          repeat($._field),
        ),
        repeat1($._field),
      ),
      optional($._newline),
    )),

    completed_task_prefix: $ => prec.right(choice(
      seq($.completed_marker, $.completion_date, optional($.creation_date)),
      $.completed_marker,
    )),

    active_task_prefix: $ => prec.right(choice(
      seq($.priority, optional($.creation_date)),
      $.creation_date,
    )),

    _field: $ => choice(
      $.project,
      $.context,
      $.metadata,
      $.text,
    ),

    completed_marker: _ => token(prec(3, "x")),
    priority: _ => token(prec(3, /\([A-Z]\)/)),
    completion_date: _ => token(prec(2, /\d{4}-\d{2}-\d{2}/)),
    creation_date: _ => token(prec(2, /\d{4}-\d{2}-\d{2}/)),
    project: _ => token(prec(2, /\+[^\s]+/)),
    context: _ => token(prec(2, /@[^\s]+/)),
    metadata: _ => token(prec(2, /[^\s:]+:[^\s:]+/)),
    text: _ => token(/[^\s]+/),

    _newline: _ => /\r?\n/,
  },
});
